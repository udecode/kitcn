import type { BetterAuthDBSchema, DBFieldAttribute } from 'better-auth/db';

// Manually add fields to index on for schema generation,
// all fields in the schema specialFields are automatically indexed
export const indexFields = {
  account: ['accountId', ['accountId', 'providerId'], ['providerId', 'userId']],
  oauthConsent: [['clientId', 'userId']],
  passkey: ['credentialID'],
  ratelimit: ['key'],
  rateLimit: ['key'],
  session: ['expiresAt', ['expiresAt', 'userId']],
  user: [['email', 'name'], 'name'],
  verification: ['expiresAt', 'identifier'],
};

type BetterAuthFieldReference = {
  field: string;
  model: string;
};

type BetterAuthFieldPatch = Pick<DBFieldAttribute, 'required' | 'type'> & {
  fieldName?: string;
  references?: BetterAuthFieldReference;
  sortable?: boolean;
  unique?: boolean;
};

const cloneTables = (tables: BetterAuthDBSchema): BetterAuthDBSchema =>
  Object.fromEntries(
    Object.entries(tables).map(([key, table]) => [
      key,
      {
        ...table,
        fields: { ...table.fields },
      },
    ])
  );

const ensureField = (
  tables: BetterAuthDBSchema,
  tableKey: string,
  fieldKey: string,
  fieldPatch: BetterAuthFieldPatch
) => {
  const table = tables[tableKey];
  if (!table) {
    return;
  }

  const existingField = table.fields[fieldKey] as DBFieldAttribute | undefined;
  if (!existingField) {
    table.fields[fieldKey] = fieldPatch as DBFieldAttribute;
    return;
  }

  table.fields[fieldKey] = {
    ...fieldPatch,
    ...existingField,
    references: existingField.references ?? fieldPatch.references,
  };
};

export const augmentBetterAuthTables = (
  sourceTables: BetterAuthDBSchema
): BetterAuthDBSchema => {
  const tables = cloneTables(sourceTables);

  if (tables.organization && tables.user) {
    const organizationReference = {
      field: 'id',
      model: 'organization',
    } as const;
    ensureField(tables, 'user', 'lastActiveOrganizationId', {
      references: organizationReference,
      required: false,
      type: 'string',
    });
    ensureField(tables, 'user', 'personalOrganizationId', {
      references: organizationReference,
      required: false,
      type: 'string',
    });
    ensureField(tables, 'session', 'activeOrganizationId', {
      references: organizationReference,
      required: false,
      type: 'string',
    });
  }

  if (tables.team) {
    const teamReference = {
      field: 'id',
      model: 'team',
    } as const;
    ensureField(tables, 'session', 'activeTeamId', {
      references: teamReference,
      required: false,
      type: 'string',
    });
    ensureField(tables, 'invitation', 'teamId', {
      references: teamReference,
      required: false,
      type: 'string',
    });
  }

  return tables;
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
      const resolveIndexField = (fieldKey: string) => {
        const field = table.fields[fieldKey];
        return field ? (field.fieldName ?? fieldKey) : null;
      };
      const manualIndexes =
        indexFields[key as keyof typeof indexFields]?.reduce<
          Array<string | string[]>
        >((indexes, index) => {
          if (typeof index === 'string') {
            const resolved = resolveIndexField(index);
            if (resolved) {
              indexes.push(resolved);
            }
            return indexes;
          }

          const resolved = index
            .map((fieldKey) => resolveIndexField(fieldKey))
            .filter((fieldName): fieldName is string => fieldName !== null);
          if (resolved.length === index.length) {
            indexes.push(resolved);
          }
          return indexes;
        }, []) || [];
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

export const createSchema = async ({
  exportName = 'tables',
  file,
  regenerateCommand,
  tables,
}: {
  exportName?: string;
  regenerateCommand?: string;
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

  tables = augmentBetterAuthTables(tables);

  let code = `// This file is auto-generated. Do not edit this file manually.
// To regenerate the schema, run:
// \`${regenerateCommand ?? `npx @better-auth/cli generate --output ${file} -y`}\`

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const ${exportName} = {
`;

  for (const [tableKey, table] of Object.entries(tables)) {
    const modelName = table.modelName;

    // No id fields in Convex schema
    const fields = Object.fromEntries(
      Object.entries(table.fields).filter(([key]) => key !== 'id')
    );

    function getType(_name: string, field: DBFieldAttribute) {
      const type = field.type as
        | 'boolean'
        | 'date'
        | 'json'
        | 'number'
        | 'string'
        | `${'number' | 'string'}[]`;

      const typeMap: Record<typeof type, string> = {
        boolean: 'v.boolean()',
        date: 'v.number()',
        json: 'v.string()',
        number: 'v.number()',
        'number[]': 'v.array(v.number())',
        string: 'v.string()',
        'string[]': 'v.array(v.string())',
      } as const;

      return typeMap[type];
    }

    const indexes =
      mergedIndexFields(tables)[
        tableKey as keyof typeof mergedIndexFields
      ]?.map((index) => {
        const indexArray = Array.isArray(index) ? index.sort() : [index];
        const indexName = indexArray.join('_');

        return `.index("${indexName}", ${JSON.stringify(indexArray)})`;
      }) || [];

    const schema = `${modelName}: defineTable({
${Object.keys(fields)
  .map((field) => {
    const attr = fields[field]!;
    const type = getType(field, attr as DBFieldAttribute);
    const optional = (fieldSchema: string) =>
      attr.required
        ? fieldSchema
        : `v.optional(v.union(v.null(), ${fieldSchema}))`;

    return `    ${attr.fieldName ?? field}: ${optional(type)},`;
  })
  .join('\n')}
  })${indexes.length > 0 ? `\n    ${indexes.join('\n    ')}` : ''},\n`;
    code += `  ${schema}`;
  }

  code += `};

const schema = defineSchema(${exportName});

export default schema;
`;

  return {
    code,
    overwrite: true,
    path: file ?? './schema.ts',
  };
};
