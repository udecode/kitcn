import type { BetterAuthDBSchema, DBFieldAttribute } from 'better-auth/db';
import { indexFields } from './create-schema';

type FieldType =
  | 'boolean'
  | 'date'
  | 'json'
  | 'number'
  | 'string'
  | 'number[]'
  | 'string[]'
  | string[];

type TableEntry = {
  key: string;
  modelName: string;
  table: BetterAuthDBSchema[string];
  varName: string;
};

// Return map of unique, sortable, and reference fields
const specialFields = (tables: BetterAuthDBSchema) =>
  Object.fromEntries(
    Object.entries(tables)
      .map(([key, table]) => {
        const fields = Object.fromEntries(
          Object.entries(table.fields)
            .map(([fieldKey, field]) => [
              field.fieldName ?? fieldKey,
              {
                ...(field.sortable ? { sortable: true } : {}),
                ...(field.unique ? { unique: true } : {}),
                ...(field.references ? { references: field.references } : {}),
              },
            ])
            .filter(([_key, value]) =>
              typeof value === 'object' ? Object.keys(value).length > 0 : true
            )
        );

        return [key, fields];
      })
      .filter(([_key, value]) =>
        typeof value === 'object' ? Object.keys(value).length > 0 : true
      )
  );

const mergedIndexFields = (tables: BetterAuthDBSchema) =>
  Object.fromEntries(
    Object.entries(tables).map(([key, table]) => {
      const manualIndexes =
        indexFields[key as keyof typeof indexFields]?.map((index) =>
          typeof index === 'string'
            ? (table.fields[index]?.fieldName ?? index)
            : index.map((i) => table.fields[i]?.fieldName ?? i)
        ) || [];
      const specialFieldIndexes = Object.keys(
        specialFields(tables)[key as keyof ReturnType<typeof specialFields>] ||
          {}
      ).filter(
        (index) =>
          !manualIndexes.some((m) =>
            Array.isArray(m) ? m[0] === index : m === index
          )
      );

      return [key, manualIndexes.concat(specialFieldIndexes)];
    })
  );

const VALID_IDENTIFIER_REGEX = /^[$A-Z_][0-9A-Z_$]*$/i;
const LEADING_DIGIT_REGEX = /^[0-9]/;

const renderObjectKey = (value: string) =>
  VALID_IDENTIFIER_REGEX.test(value) ? value : JSON.stringify(value);

const renderPropertyAccess = (objectName: string, propertyName: string) =>
  VALID_IDENTIFIER_REGEX.test(propertyName)
    ? `${objectName}.${propertyName}`
    : `${objectName}[${JSON.stringify(propertyName)}]`;

const toIdentifier = (value: string) => {
  const normalized = value.replace(/[^a-zA-Z0-9_$]/g, '_');
  if (!normalized) {
    return '_table';
  }
  if (LEADING_DIGIT_REGEX.test(normalized)) {
    return `_${normalized}`;
  }
  return normalized;
};

const getTableEntries = (tables: BetterAuthDBSchema): TableEntry[] => {
  const usedNames = new Map<string, number>();

  return Object.entries(tables).map(([key, table]) => {
    const modelName = table.modelName;
    const baseName = toIdentifier(modelName);
    const count = usedNames.get(baseName) ?? 0;
    usedNames.set(baseName, count + 1);
    const varName = count === 0 ? baseName : `${baseName}_${count + 1}`;
    return { key, modelName, table, varName };
  });
};

const findTableEntryByModel = (
  entries: TableEntry[],
  tables: BetterAuthDBSchema,
  model: string
): TableEntry | undefined =>
  entries.find((entry) => entry.modelName === model) ??
  entries.find((entry) => entry.key === model) ??
  entries.find((entry) => tables[entry.key]?.modelName === model);

const getReferencedFieldName = (
  tables: BetterAuthDBSchema,
  entries: TableEntry[],
  model: string,
  field: string
) => {
  if (field === 'id') {
    return 'id';
  }
  const entry = findTableEntryByModel(entries, tables, model);
  if (!entry) {
    return field;
  }
  return entry.table.fields[field]?.fieldName ?? field;
};

const getTypeExpression = (
  field: DBFieldAttribute,
  state: {
    ormImports: Set<string>;
  }
): string => {
  const type = field.type as FieldType;

  if (Array.isArray(type)) {
    state.ormImports.add('textEnum');
    const values = `[${type.map((value) => JSON.stringify(value)).join(', ')}]`;
    return `textEnum(${values})`;
  }

  switch (type) {
    case 'boolean':
      state.ormImports.add('boolean');
      return 'boolean()';
    case 'date':
      state.ormImports.add('timestamp');
      return 'timestamp()';
    case 'json':
      state.ormImports.add('text');
      return 'text()';
    case 'number':
      if (field.bigint) {
        state.ormImports.add('bigint');
        return 'bigint()';
      }
      state.ormImports.add('integer');
      return 'integer()';
    case 'number[]':
      state.ormImports.add('arrayOf');
      state.ormImports.add('integer');
      return 'arrayOf(integer().notNull())';
    case 'string':
      state.ormImports.add('text');
      return 'text()';
    case 'string[]':
      state.ormImports.add('arrayOf');
      state.ormImports.add('text');
      return 'arrayOf(text().notNull())';
    default:
      throw new Error(`Unsupported Better Auth field type: ${String(type)}`);
  }
};

export const createSchemaOrm = async ({
  file,
  tables,
}: {
  tables: BetterAuthDBSchema;
  file?: string;
}) => {
  // stop convex esbuild from throwing over this import, only runs
  // in the better auth cli - decode at runtime to hide from static analysis
  const path = await import(Buffer.from('cGF0aA==', 'base64').toString());
  const baseName = path.basename(path.resolve(process.cwd(), file ?? ''));

  // if the target directory is named "convex", they're almost definitely
  // generating the schema in the wrong directory, likely would replace the
  // app schema
  if (baseName === 'convex') {
    throw new Error(
      'Better Auth schema must be generated in the Better Auth component directory.'
    );
  }

  const entries = getTableEntries(tables);
  const state = {
    ormImports: new Set<string>(['convexTable', 'defineSchema']),
  };

  const tableBlocks: string[] = [];

  for (const entry of entries) {
    const fields = Object.entries(entry.table.fields).filter(
      ([fieldKey]) => fieldKey !== 'id'
    );

    const fieldLines = fields.map(([fieldKey, field]) => {
      const attr = field as DBFieldAttribute;
      const fieldName = attr.fieldName ?? fieldKey;
      const key = renderObjectKey(fieldName);

      let expression = getTypeExpression(attr, state);

      if (attr.required) {
        expression += '.notNull()';
      }
      if (attr.unique) {
        expression += '.unique()';
      }
      if (attr.references) {
        const referencedEntry =
          findTableEntryByModel(entries, tables, attr.references.model) ??
          ({
            varName: toIdentifier(attr.references.model),
          } as const);
        const targetField = getReferencedFieldName(
          tables,
          entries,
          attr.references.model,
          attr.references.field
        );
        expression += `.references(() => ${renderPropertyAccess(referencedEntry.varName, targetField)})`;
      }

      return `    ${key}: ${expression},`;
    });

    const indexes =
      mergedIndexFields(tables)[
        entry.key as keyof ReturnType<typeof mergedIndexFields>
      ]?.map((indexSpec) => {
        const indexArray = Array.isArray(indexSpec)
          ? [...indexSpec].sort()
          : [indexSpec];
        const indexName = indexArray.join('_');
        state.ormImports.add('index');

        const fieldsCall = indexArray
          .map((fieldName) => renderPropertyAccess(entry.varName, fieldName))
          .join(', ');

        return `index(${JSON.stringify(indexName)}).on(${fieldsCall})`;
      }) || [];

    const extraConfig =
      indexes.length > 0
        ? `,\n  (${entry.varName}) => [\n    ${indexes.join(',\n    ')},\n  ]`
        : '';

    tableBlocks.push(
      `export const ${entry.varName} = convexTable(\n  ${JSON.stringify(entry.modelName)},\n  {\n${fieldLines.join('\n')}\n  }${extraConfig}\n);`
    );
  }

  const importList = Array.from(state.ormImports).sort();
  const imports = `import {\n  ${importList.join(',\n  ')},\n} from "better-convex/orm";`;

  const tableObjectEntries = entries.map((entry) => {
    if (renderObjectKey(entry.modelName) === entry.varName) {
      return `  ${entry.varName},`;
    }

    return `  ${renderObjectKey(entry.modelName)}: ${entry.varName},`;
  });

  const code = `// This file is auto-generated. Do not edit this file manually.
// To regenerate the schema, run:
// \`npx @better-auth/cli generate --output ${file} -y\`

${imports}

${tableBlocks.join('\n\n')}

export const tables = {
${tableObjectEntries.join('\n')}
};

const schema = defineSchema(tables);

export default schema;
`;

  return {
    code,
    overwrite: true,
    path: file ?? './schema.ts',
  };
};
