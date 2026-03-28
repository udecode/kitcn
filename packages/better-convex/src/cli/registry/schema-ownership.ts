import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import ts from 'typescript';
import type {
  PluginRootSchemaOwnership,
  PluginRootSchemaTableOwnership,
  PromptAdapter,
} from '../types.js';

export type RootSchemaTableUnit = {
  declaration: string;
  importNames: string[];
  key: string;
  registration: string;
  relations?: string;
};

export type RootSchemaOwnershipLock = PluginRootSchemaOwnership;

type TablesObjectInfo = {
  object: ts.ObjectLiteralExpression;
  sourceFile: ts.SourceFile;
  statementStart: number;
};

type RelationsChainInfo = {
  call: ts.CallExpression;
  object: ts.ObjectLiteralExpression;
  sourceFile: ts.SourceFile;
};

type TableDeclarationInfo = {
  call: ts.CallExpression;
  fieldsObject: ts.ObjectLiteralExpression;
  indexEntries: readonly ts.Expression[] | null;
  indexParamName: string | null;
  sourceFile: ts.SourceFile;
  statement: ts.VariableStatement;
  tableKey: string;
  tableNameText: string;
  thirdArgText: string | null;
  varName: string;
};

type SchemaMergeMeta = {
  hadExistingFragments: boolean;
};

type MergeNamedEntriesResult = {
  changed: boolean;
  entries: string[];
};

const OBJECT_ENTRY_INDENT = '  ';
const LEADING_INDENT_RE = /^[ \t]*/;
const LEGACY_MANAGED_COMMENT_RE =
  /^[ \t]*\/\* better-convex-managed [^*]+ \*\/\n?/gm;
const WHITESPACE_RE = /\s/;

const printer = ts.createPrinter({ removeComments: true });

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizePathForMessage = (path: string) => {
  const relativePath = relative(process.cwd(), path).replaceAll('\\', '/');
  return relativePath.startsWith('..')
    ? path.replaceAll('\\', '/')
    : relativePath;
};

const stripLegacyManagedComments = (source: string) =>
  source.replace(LEGACY_MANAGED_COMMENT_RE, '').replace(/\n{3,}/g, '\n\n');

const parseSource = (source: string) =>
  ts.createSourceFile(
    'schema.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

const indentBlock = (value: string, indent: string) =>
  value
    .trim()
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');

const ensureTrailingComma = (value: string) => {
  const trimmed = value.trim();
  return trimmed.endsWith(',') ? trimmed : `${trimmed},`;
};

const getIndentAt = (source: string, index: number) => {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1;
  const match = LEADING_INDENT_RE.exec(source.slice(lineStart));
  return match?.[0] ?? '';
};

const replaceRange = (
  source: string,
  start: number,
  end: number,
  content: string
) => `${source.slice(0, start)}${content}${source.slice(end)}`;

const isStringLiteralLike = (
  node: ts.Node
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

const getPropertyName = (property: ts.ObjectLiteralElementLike) => {
  if (
    (ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property)) &&
    property.name
  ) {
    if (ts.isIdentifier(property.name)) {
      return property.name.text;
    }
    if (isStringLiteralLike(property.name)) {
      return property.name.text;
    }
  }

  return null;
};

const renderNode = (node: ts.Node, sourceFile: ts.SourceFile) =>
  printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).trim();

const renderObjectLiteral = (
  baseIndent: string,
  entries: readonly string[]
) => {
  if (entries.length === 0) {
    return '{}';
  }

  const entryIndent = `${baseIndent}${OBJECT_ENTRY_INDENT}`;
  return `{\n${entries
    .map((entry) => indentBlock(entry, entryIndent))
    .join('\n')}\n${baseIndent}}`;
};

const renderArrayLiteral = (baseIndent: string, entries: readonly string[]) => {
  if (entries.length === 0) {
    return '[]';
  }

  const entryIndent = `${baseIndent}${OBJECT_ENTRY_INDENT}`;
  return `[\n${entries
    .map((entry) => `${entryIndent}${entry.trim()},`)
    .join('\n')}\n${baseIndent}]`;
};

const findTablesObject = (source: string): TablesObjectInfo | null => {
  const sourceFile = parseSource(source);

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === 'tables' &&
        declaration.initializer &&
        ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        return {
          object: declaration.initializer,
          sourceFile,
          statementStart: statement.getStart(sourceFile),
        };
      }
    }
  }

  let defineSchemaObject: TablesObjectInfo | null = null;

  const visit = (node: ts.Node, statementStart: number) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineSchema'
    ) {
      const firstArg = node.arguments[0];
      if (
        firstArg &&
        ts.isObjectLiteralExpression(firstArg) &&
        !defineSchemaObject
      ) {
        defineSchemaObject = {
          object: firstArg,
          sourceFile,
          statementStart,
        };
      }
    }
    ts.forEachChild(node, (child) => visit(child, statementStart));
  };

  for (const statement of sourceFile.statements) {
    visit(statement, statement.getStart(sourceFile));
  }

  return defineSchemaObject;
};

const findRelationsCall = (source: string): RelationsChainInfo | null => {
  const sourceFile = parseSource(source);
  let result: RelationsChainInfo | null = null;

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'relations'
    ) {
      const firstArg = node.arguments[0];
      if (firstArg && ts.isArrowFunction(firstArg)) {
        const body = ts.isParenthesizedExpression(firstArg.body)
          ? firstArg.body.expression
          : firstArg.body;
        if (ts.isObjectLiteralExpression(body) && !result) {
          result = {
            call: node,
            object: body,
            sourceFile,
          };
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return result;
};

const hasStandaloneDefineRelations = (source: string) => {
  const sourceFile = parseSource(source);
  let found = false;

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineRelations'
    ) {
      found = true;
      return;
    }
    if (!found) {
      ts.forEachChild(node, visit);
    }
  };

  visit(sourceFile);
  return found;
};

const getArrayLiteralFromExpression = (expression: ts.Expression) => {
  if (ts.isArrayLiteralExpression(expression)) {
    return expression;
  }
  if (
    ts.isParenthesizedExpression(expression) &&
    ts.isArrayLiteralExpression(expression.expression)
  ) {
    return expression.expression;
  }
  return null;
};

const readTableDeclarationInfo = (
  source: string,
  tableKey: string
): TableDeclarationInfo | null => {
  const sourceFile = parseSource(source);

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        !declaration.initializer ||
        !ts.isCallExpression(declaration.initializer) ||
        !ts.isIdentifier(declaration.initializer.expression) ||
        declaration.initializer.expression.text !== 'convexTable'
      ) {
        continue;
      }

      const firstArg = declaration.initializer.arguments[0];
      const secondArg = declaration.initializer.arguments[1];
      if (
        !firstArg ||
        !secondArg ||
        !isStringLiteralLike(firstArg) ||
        firstArg.text !== tableKey ||
        !ts.isObjectLiteralExpression(secondArg)
      ) {
        continue;
      }

      const thirdArg = declaration.initializer.arguments[2];
      let indexEntries: readonly ts.Expression[] | null = null;
      let indexParamName: string | null = null;
      if (
        thirdArg &&
        ts.isArrowFunction(thirdArg) &&
        thirdArg.parameters[0] &&
        ts.isIdentifier(thirdArg.parameters[0].name)
      ) {
        const arrayLiteral = ts.isBlock(thirdArg.body)
          ? null
          : getArrayLiteralFromExpression(thirdArg.body);
        if (arrayLiteral) {
          indexEntries = arrayLiteral.elements.filter(
            (element): element is ts.Expression => ts.isExpression(element)
          );
          indexParamName = thirdArg.parameters[0].name.text;
        }
      }

      return {
        call: declaration.initializer,
        fieldsObject: secondArg,
        indexEntries,
        indexParamName,
        sourceFile,
        statement,
        tableKey,
        tableNameText: firstArg.getText(sourceFile),
        thirdArgText: thirdArg ? thirdArg.getText(sourceFile) : null,
        varName: declaration.name.text,
      };
    }
  }

  return null;
};

const parseUnitTableDeclaration = (unit: RootSchemaTableUnit) => {
  const info = readTableDeclarationInfo(unit.declaration, unit.key);
  if (!info) {
    throw new Error(
      `Schema patch error: expected auth table declaration for "${unit.key}".`
    );
  }
  return info;
};

const readPropertyObject = (source: string, expectedKey?: string) => {
  const wrapped = `const object = {${source.trim()}};`;
  const sourceFile = parseSource(wrapped);
  const statement = sourceFile.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) {
    return null;
  }
  const declaration = statement.declarationList.declarations[0];
  if (
    !declaration?.initializer ||
    !ts.isObjectLiteralExpression(declaration.initializer)
  ) {
    return null;
  }
  const property = declaration.initializer.properties[0];
  if (
    !property ||
    !ts.isPropertyAssignment(property) ||
    !property.name ||
    !ts.isObjectLiteralExpression(property.initializer)
  ) {
    return null;
  }

  const propertyName = getPropertyName(property);
  if (expectedKey && propertyName !== expectedKey) {
    return null;
  }

  return {
    object: property.initializer,
    property,
    propertyName: propertyName ?? expectedKey ?? null,
    sourceFile,
  };
};

const getObjectPropertyMap = (
  object: ts.ObjectLiteralExpression,
  _sourceFile: ts.SourceFile
) =>
  new Map(
    object.properties.flatMap((property) => {
      const propertyName = getPropertyName(property);
      return propertyName ? [[propertyName, property]] : [];
    })
  );

const getFieldRootSignature = (
  expression: ts.Expression,
  sourceFile: ts.SourceFile
) => {
  let current: ts.Expression = expression;

  while (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression)
  ) {
    current = current.expression.expression;
  }

  return ts.isCallExpression(current) ? renderNode(current, sourceFile) : null;
};

const isCompatibleFieldProperty = (
  existingProperty: ts.ObjectLiteralElementLike,
  existingSourceFile: ts.SourceFile,
  desiredProperty: ts.ObjectLiteralElementLike,
  desiredSourceFile: ts.SourceFile
) => {
  if (
    !ts.isPropertyAssignment(existingProperty) ||
    !ts.isPropertyAssignment(desiredProperty)
  ) {
    return false;
  }

  const existingCanonical = renderNode(existingProperty, existingSourceFile);
  const desiredCanonical = renderNode(desiredProperty, desiredSourceFile);
  if (existingCanonical === desiredCanonical) {
    return true;
  }

  const existingSignature = getFieldRootSignature(
    existingProperty.initializer,
    existingSourceFile
  );
  const desiredSignature = getFieldRootSignature(
    desiredProperty.initializer,
    desiredSourceFile
  );

  return (
    typeof existingSignature === 'string' &&
    existingSignature === desiredSignature
  );
};

const getRelationCompatibilitySignature = (
  property: ts.ObjectLiteralElementLike,
  sourceFile: ts.SourceFile
) => {
  if (
    !ts.isPropertyAssignment(property) ||
    !ts.isCallExpression(property.initializer)
  ) {
    return null;
  }

  const relationKind = renderNormalizedExpression(
    property.initializer.expression,
    sourceFile,
    {}
  );
  const firstArg = property.initializer.arguments[0];
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    return relationKind;
  }

  const propertyMap = getObjectPropertyMap(firstArg, sourceFile);
  const from = propertyMap.get('from');
  const to = propertyMap.get('to');

  return [
    relationKind,
    from ? renderNode(from, sourceFile) : '',
    to ? renderNode(to, sourceFile) : '',
  ].join('|');
};

const getIndexIdentity = (
  expression: ts.Expression,
  sourceFile: ts.SourceFile
) => {
  let current: ts.Expression = expression;

  while (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression)
  ) {
    current = current.expression.expression;
  }

  if (
    ts.isCallExpression(current) &&
    ts.isIdentifier(current.expression) &&
    current.arguments[0] &&
    isStringLiteralLike(current.arguments[0])
  ) {
    return `${current.expression.text}:${current.arguments[0].text}`;
  }

  return renderNode(current, sourceFile);
};

const renderNormalizedExpression = (
  node: ts.Node,
  sourceFile: ts.SourceFile,
  replacements: Record<string, string>
): string => {
  if (ts.isIdentifier(node)) {
    return replacements[node.text] ?? node.text;
  }
  if (isStringLiteralLike(node)) {
    return JSON.stringify(node.text);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return `${renderNormalizedExpression(node.expression, sourceFile, replacements)}.${node.name.text}`;
  }
  if (ts.isCallExpression(node)) {
    return `${renderNormalizedExpression(node.expression, sourceFile, replacements)}(${node.arguments
      .map((argument) =>
        renderNormalizedExpression(argument, sourceFile, replacements)
      )
      .join(',')})`;
  }
  if (ts.isParenthesizedExpression(node)) {
    return `(${renderNormalizedExpression(node.expression, sourceFile, replacements)})`;
  }

  return renderNode(node, sourceFile);
};

const mergeNamedEntries = (params: {
  compatibilityLabel: string;
  displayPath: string;
  existingEntries: readonly ts.ObjectLiteralElementLike[];
  existingSourceFile: ts.SourceFile;
  isCompatible: (
    existingEntry: ts.ObjectLiteralElementLike,
    existingSourceFile: ts.SourceFile,
    desiredEntry: ts.ObjectLiteralElementLike,
    desiredSourceFile: ts.SourceFile
  ) => boolean;
  key: string;
  pluginKey: string;
  desiredEntries: readonly ts.ObjectLiteralElementLike[];
  desiredSourceFile: ts.SourceFile;
  tableKey: string;
}): MergeNamedEntriesResult => {
  const existingMap = new Map(
    params.existingEntries.flatMap((entry) => {
      const name = getPropertyName(entry);
      return name ? [[name, entry]] : [];
    })
  );
  const nextEntries = params.existingEntries.map((entry) =>
    entry.getText(params.existingSourceFile)
  );
  let changed = false;

  for (const desiredEntry of params.desiredEntries) {
    const desiredName = getPropertyName(desiredEntry);
    if (!desiredName) {
      continue;
    }

    const existingEntry = existingMap.get(desiredName);
    if (!existingEntry) {
      nextEntries.push(desiredEntry.getText(params.desiredSourceFile));
      changed = true;
      continue;
    }

    if (
      !params.isCompatible(
        existingEntry,
        params.existingSourceFile,
        desiredEntry,
        params.desiredSourceFile
      )
    ) {
      throw new Error(
        `Schema patch conflict in ${params.displayPath}: ${params.pluginKey} ${params.compatibilityLabel} "${desiredName}" on table "${params.tableKey}" is incompatible with the existing schema.`
      );
    }
  }

  return {
    changed,
    entries: nextEntries,
  };
};

const mergeFieldEntries = (params: {
  desiredInfo: TableDeclarationInfo;
  displayPath: string;
  existingInfo: TableDeclarationInfo;
  pluginKey: string;
  tableKey: string;
}) =>
  mergeNamedEntries({
    compatibilityLabel: 'field',
    displayPath: params.displayPath,
    existingEntries: params.existingInfo.fieldsObject.properties,
    existingSourceFile: params.existingInfo.sourceFile,
    isCompatible: isCompatibleFieldProperty,
    key: params.tableKey,
    pluginKey: params.pluginKey,
    desiredEntries: params.desiredInfo.fieldsObject.properties,
    desiredSourceFile: params.desiredInfo.sourceFile,
    tableKey: params.tableKey,
  });

const mergeIndexEntries = (params: {
  desiredInfo: TableDeclarationInfo;
  displayPath: string;
  existingInfo: TableDeclarationInfo;
  pluginKey: string;
  tableKey: string;
}) => {
  const targetParamName =
    params.existingInfo.indexParamName ??
    params.existingInfo.varName ??
    params.desiredInfo.indexParamName;
  const desiredParamName =
    params.desiredInfo.indexParamName ?? params.desiredInfo.varName;
  const desiredEntries = params.desiredInfo.indexEntries;
  if (!desiredEntries || desiredEntries.length === 0) {
    return {
      changed: false,
      entries: params.existingInfo.indexEntries?.map((entry) =>
        entry.getText(params.existingInfo.sourceFile)
      ),
      indexParamName: targetParamName,
      requiresIndexArg: Boolean(params.existingInfo.thirdArgText),
    };
  }

  if (params.existingInfo.thirdArgText && !params.existingInfo.indexEntries) {
    throw new Error(
      `Schema patch conflict in ${params.displayPath}: ${params.pluginKey} indexes for table "${params.tableKey}" could not be merged into the existing schema callback.`
    );
  }

  const existingEntries = params.existingInfo.indexEntries ?? [];
  const existingMap = new Map(
    existingEntries.map((entry) => [
      getIndexIdentity(entry, params.existingInfo.sourceFile),
      entry,
    ])
  );
  const nextEntries = existingEntries.map((entry) =>
    entry.getText(params.existingInfo.sourceFile)
  );
  let changed = false;

  for (const desiredEntry of desiredEntries) {
    const identity = getIndexIdentity(
      desiredEntry,
      params.desiredInfo.sourceFile
    );
    const existingEntry = existingMap.get(identity);
    if (!existingEntry) {
      const desiredText = desiredEntry.getText(params.desiredInfo.sourceFile);
      nextEntries.push(
        desiredParamName &&
          targetParamName &&
          desiredParamName !== targetParamName
          ? desiredText.replaceAll(
              new RegExp(`\\b${escapeRegex(desiredParamName)}\\.`, 'g'),
              `${targetParamName}.`
            )
          : desiredText
      );
      changed = true;
      continue;
    }

    const existingRendered = renderNormalizedExpression(
      existingEntry,
      params.existingInfo.sourceFile,
      {
        [(params.existingInfo.indexParamName ??
          params.existingInfo.varName) as string]: '__table__',
      }
    );
    const desiredRendered = renderNormalizedExpression(
      desiredEntry,
      params.desiredInfo.sourceFile,
      {
        [desiredParamName as string]: '__table__',
      }
    );
    if (existingRendered !== desiredRendered) {
      throw new Error(
        `Schema patch conflict in ${params.displayPath}: ${params.pluginKey} index "${identity}" on table "${params.tableKey}" is incompatible with the existing schema.`
      );
    }
  }

  return {
    changed,
    entries: nextEntries,
    indexParamName: targetParamName,
    requiresIndexArg: Boolean(
      params.existingInfo.thirdArgText ?? nextEntries.length > 0
    ),
  };
};

const renderTableStatement = (params: {
  fieldEntries: readonly string[];
  indexEntries: readonly string[] | null | undefined;
  indexParamName?: string | null;
  tableNameText: string;
  varName: string;
}) => {
  const fieldsText = renderObjectLiteral(
    '  ',
    params.fieldEntries.map(ensureTrailingComma)
  );
  const indexEntries = params.indexEntries ?? [];
  const indexBlock =
    indexEntries.length > 0
      ? `,\n  (${params.indexParamName ?? params.varName}) => ${renderArrayLiteral(
          '  ',
          indexEntries
        )}`
      : '';

  return `export const ${params.varName} = convexTable(\n  ${params.tableNameText},\n  ${fieldsText}${indexBlock}\n);`;
};

const insertDeclaration = (source: string, declaration: string) => {
  const tablesObject = findTablesObject(source);
  if (!tablesObject) {
    throw new Error(
      'Could not patch schema.ts: expected defineSchema(...) tables.'
    );
  }

  return `${source.slice(0, tablesObject.statementStart)}${declaration.trim()}\n\n${source.slice(tablesObject.statementStart)}`;
};

const mergeTableDeclaration = (params: {
  displayPath: string;
  pluginKey: string;
  source: string;
  unit: RootSchemaTableUnit;
}) => {
  const desiredInfo = parseUnitTableDeclaration(params.unit);
  const existingInfo = readTableDeclarationInfo(params.source, params.unit.key);

  if (!existingInfo) {
    return {
      content: insertDeclaration(params.source, params.unit.declaration),
      hadExistingFragments: false,
      varName: desiredInfo.varName,
    } satisfies SchemaMergeMeta & { content: string; varName: string };
  }

  const fieldMerge = mergeFieldEntries({
    desiredInfo,
    displayPath: params.displayPath,
    existingInfo,
    pluginKey: params.pluginKey,
    tableKey: params.unit.key,
  });
  const indexMerge = mergeIndexEntries({
    desiredInfo,
    displayPath: params.displayPath,
    existingInfo,
    pluginKey: params.pluginKey,
    tableKey: params.unit.key,
  });

  if (!fieldMerge.changed && !indexMerge.changed) {
    return {
      content: params.source,
      hadExistingFragments: true,
      varName: existingInfo.varName,
    } satisfies SchemaMergeMeta & { content: string; varName: string };
  }

  const nextStatement = renderTableStatement({
    fieldEntries: fieldMerge.entries,
    indexEntries: indexMerge.requiresIndexArg ? indexMerge.entries : null,
    indexParamName: indexMerge.indexParamName,
    tableNameText: existingInfo.tableNameText,
    varName: existingInfo.varName,
  });

  return {
    content: replaceRange(
      params.source,
      existingInfo.statement.getStart(existingInfo.sourceFile),
      existingInfo.statement.end,
      nextStatement
    ),
    hadExistingFragments: true,
    varName: existingInfo.varName,
  } satisfies SchemaMergeMeta & { content: string; varName: string };
};

const buildRegistrationEntry = (tableKey: string, varName: string) =>
  `${VALID_IDENTIFIER_REGEX.test(tableKey) ? tableKey : JSON.stringify(tableKey)}: ${varName}`;

const updateTablesObject = (
  source: string,
  registrations: readonly { key: string; varName: string }[]
) => {
  const info = findTablesObject(source);
  if (!info) {
    throw new Error(
      'Could not patch schema.ts: expected defineSchema(...) tables.'
    );
  }

  const existingMap = getObjectPropertyMap(info.object, info.sourceFile);
  const existingEntries = info.object.properties.map((property) =>
    ensureTrailingComma(property.getText(info.sourceFile))
  );
  let changed = false;

  for (const registration of registrations) {
    if (existingMap.has(registration.key)) {
      continue;
    }
    existingEntries.push(
      ensureTrailingComma(
        buildRegistrationEntry(registration.key, registration.varName)
      )
    );
    changed = true;
  }

  if (!changed) {
    return source;
  }

  return replaceRange(
    source,
    info.object.getStart(info.sourceFile),
    info.object.end,
    renderObjectLiteral(
      getIndentAt(source, info.object.getStart(info.sourceFile)),
      existingEntries
    )
  );
};

const skipWhitespace = (source: string, start: number) => {
  let cursor = start;
  while (cursor < source.length && WHITESPACE_RE.test(source[cursor]!)) {
    cursor += 1;
  }
  return cursor;
};

const findBalancedParenEnd = (source: string, openParenIndex: number) => {
  let depth = 0;
  for (let index = openParenIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
};

const findRelationsInsertIndex = (source: string) => {
  const defineSchemaIndex = source.indexOf('defineSchema(');
  if (defineSchemaIndex < 0) {
    return -1;
  }

  const defineSchemaOpenParenIndex = source.indexOf('(', defineSchemaIndex);
  if (defineSchemaOpenParenIndex < 0) {
    return -1;
  }

  const defineSchemaCloseParenIndex = findBalancedParenEnd(
    source,
    defineSchemaOpenParenIndex
  );
  if (defineSchemaCloseParenIndex < 0) {
    return -1;
  }

  let cursor = defineSchemaCloseParenIndex + 1;
  while (cursor < source.length) {
    const nextSegmentIndex = skipWhitespace(source, cursor);

    if (source.startsWith('.relations(', nextSegmentIndex)) {
      return nextSegmentIndex;
    }
    if (source.startsWith('.triggers(', nextSegmentIndex)) {
      return nextSegmentIndex;
    }
    if (!source.startsWith('.extend(', nextSegmentIndex)) {
      return nextSegmentIndex;
    }

    const extendOpenParenIndex = source.indexOf('(', nextSegmentIndex);
    if (extendOpenParenIndex < 0) {
      return -1;
    }

    const extendCloseParenIndex = findBalancedParenEnd(
      source,
      extendOpenParenIndex
    );
    if (extendCloseParenIndex < 0) {
      return -1;
    }

    cursor = extendCloseParenIndex + 1;
  }

  return cursor;
};

const mergeRelationProperty = (params: {
  desiredRelation: string;
  displayPath: string;
  existingProperty: ts.ObjectLiteralElementLike;
  existingSourceFile: ts.SourceFile;
  pluginKey: string;
  tableKey: string;
}) => {
  const desiredInfo = readPropertyObject(
    params.desiredRelation,
    params.tableKey
  );
  if (!desiredInfo) {
    throw new Error(
      `Schema patch error: expected relation block for "${params.tableKey}".`
    );
  }

  if (
    !ts.isPropertyAssignment(params.existingProperty) ||
    !ts.isObjectLiteralExpression(params.existingProperty.initializer)
  ) {
    throw new Error(
      `Schema patch conflict in ${params.displayPath}: ${params.pluginKey} relations for table "${params.tableKey}" are incompatible with the existing schema.`
    );
  }

  const existingPropertyName = params.existingProperty.name.getText(
    params.existingSourceFile
  );
  const nestedMerge = mergeNamedEntries({
    compatibilityLabel: 'relation',
    displayPath: params.displayPath,
    existingEntries: params.existingProperty.initializer.properties,
    existingSourceFile: params.existingSourceFile,
    isCompatible: (
      existingEntry,
      existingSourceFile,
      desiredEntry,
      desiredSourceFile
    ) => {
      if (
        renderNode(existingEntry, existingSourceFile) ===
        renderNode(desiredEntry, desiredSourceFile)
      ) {
        return true;
      }

      const existingSignature = getRelationCompatibilitySignature(
        existingEntry,
        existingSourceFile
      );
      const desiredSignature = getRelationCompatibilitySignature(
        desiredEntry,
        desiredSourceFile
      );

      return (
        typeof existingSignature === 'string' &&
        existingSignature === desiredSignature
      );
    },
    key: params.tableKey,
    pluginKey: params.pluginKey,
    desiredEntries: desiredInfo.object.properties,
    desiredSourceFile: desiredInfo.sourceFile,
    tableKey: params.tableKey,
  });

  if (!nestedMerge.changed) {
    return params.existingProperty.getText(params.existingSourceFile);
  }

  const objectIndent = getIndentAt(
    params.existingSourceFile.text,
    params.existingProperty.initializer.getStart(params.existingSourceFile)
  );

  return `${existingPropertyName}: ${renderObjectLiteral(
    objectIndent,
    nestedMerge.entries.map(ensureTrailingComma)
  )}`;
};

const updateRelationsObject = (
  source: string,
  params: {
    displayPath: string;
    pluginKey: string;
    tables: readonly RootSchemaTableUnit[];
  }
) => {
  const relationUnits = params.tables.filter((unit) => unit.relations);
  if (relationUnits.length === 0) {
    return source;
  }

  const existingRelations = findRelationsCall(source);
  if (!existingRelations) {
    const insertIndex = findRelationsInsertIndex(source);
    if (insertIndex < 0) {
      throw new Error(
        'Could not patch schema.ts: expected defineSchema(...) call chain.'
      );
    }
    const relationEntries = relationUnits.map((unit) =>
      ensureTrailingComma(unit.relations!)
    );
    return `${source.slice(0, insertIndex)}.relations((r) => (${renderObjectLiteral(
      '',
      relationEntries
    )}))${source.slice(insertIndex)}`;
  }

  const existingMap = getObjectPropertyMap(
    existingRelations.object,
    existingRelations.sourceFile
  );
  const nextEntries: string[] = [];
  let changed = false;

  for (const property of existingRelations.object.properties) {
    const propertyName = getPropertyName(property);
    if (!propertyName) {
      nextEntries.push(
        ensureTrailingComma(property.getText(existingRelations.sourceFile))
      );
      continue;
    }

    const desiredUnit = relationUnits.find((unit) => unit.key === propertyName);
    if (!desiredUnit?.relations) {
      nextEntries.push(
        ensureTrailingComma(property.getText(existingRelations.sourceFile))
      );
      continue;
    }

    const mergedProperty = mergeRelationProperty({
      desiredRelation: desiredUnit.relations,
      displayPath: params.displayPath,
      existingProperty: property,
      existingSourceFile: existingRelations.sourceFile,
      pluginKey: params.pluginKey,
      tableKey: desiredUnit.key,
    });
    if (mergedProperty !== property.getText(existingRelations.sourceFile)) {
      changed = true;
    }
    nextEntries.push(ensureTrailingComma(mergedProperty));
  }

  for (const desiredUnit of relationUnits) {
    if (existingMap.has(desiredUnit.key)) {
      continue;
    }
    nextEntries.push(ensureTrailingComma(desiredUnit.relations!));
    changed = true;
  }

  if (!changed) {
    return source;
  }

  return replaceRange(
    source,
    existingRelations.object.getStart(existingRelations.sourceFile),
    existingRelations.object.end,
    renderObjectLiteral(
      getIndentAt(
        source,
        existingRelations.object.getStart(existingRelations.sourceFile)
      ),
      nextEntries
    )
  );
};

const printCanonicalObjectEntry = (content: string) => {
  const source = `const object = {\n${content.trim()}\n};`;
  const sourceFile = parseSource(source);
  const statement = sourceFile.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) {
    return content.trim();
  }
  const declaration = statement.declarationList.declarations[0];
  if (
    !declaration?.initializer ||
    !ts.isObjectLiteralExpression(declaration.initializer)
  ) {
    return content.trim();
  }
  const property = declaration.initializer.properties[0];
  if (!property) {
    return content.trim();
  }
  return renderNode(property, sourceFile);
};

const renderManagedObjectEntryFingerprint = (content: string) =>
  ensureTrailingComma(printCanonicalObjectEntry(content));

const renderManagedFingerprintSource = (params: {
  declaration: string;
  registration: string;
  relations?: string;
}) =>
  [
    params.declaration.trim(),
    renderManagedObjectEntryFingerprint(params.registration),
    params.relations
      ? renderManagedObjectEntryFingerprint(params.relations)
      : undefined,
  ]
    .filter(Boolean)
    .join('\n---\n');

const renderManagedChecksum = (unit: RootSchemaTableUnit) =>
  createHash('sha1')
    .update(
      renderManagedFingerprintSource({
        declaration: unit.declaration,
        registration: unit.registration,
        relations: unit.relations,
      })
    )
    .digest('hex')
    .slice(0, 12);

const findObjectProperty = (
  object: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  tableKey: string
) => {
  for (const property of object.properties) {
    if (getPropertyName(property) === tableKey) {
      return property.getText(sourceFile).trim();
    }
  }

  return null;
};

const extractManagedFragments = (source: string, tableKey: string) => {
  const declarationInfo = readTableDeclarationInfo(source, tableKey);
  const declaration =
    declarationInfo?.statement.getText(declarationInfo.sourceFile) ?? null;
  const tablesObject = findTablesObject(source);
  const registration = tablesObject
    ? findObjectProperty(tablesObject.object, tablesObject.sourceFile, tableKey)
    : null;
  const relationsObject = findRelationsCall(source);
  const relations = relationsObject
    ? findObjectProperty(
        relationsObject.object,
        relationsObject.sourceFile,
        tableKey
      )
    : null;

  return {
    declaration,
    registration,
    relations,
  };
};

const readManagedChecksumFromSource = (
  source: string,
  unit: RootSchemaTableUnit
) => {
  const fragments = extractManagedFragments(source, unit.key);
  if (!fragments.declaration || !fragments.registration) {
    return null;
  }
  if (unit.relations && !fragments.relations) {
    return null;
  }
  if (!unit.relations && fragments.relations) {
    return null;
  }

  return createHash('sha1')
    .update(
      renderManagedFingerprintSource({
        declaration: fragments.declaration,
        registration: fragments.registration,
        relations: fragments.relations ?? undefined,
      })
    )
    .digest('hex')
    .slice(0, 12);
};

const mergeOrmImports = (source: string, importNames: readonly string[]) => {
  if (importNames.length === 0) {
    return source;
  }

  const sourceFile = parseSource(source);
  const ormImport = sourceFile.statements.find(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) &&
      isStringLiteralLike(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'better-convex/orm'
  );

  if (!ormImport) {
    const importText = `import {\n  ${[...new Set(importNames)].sort().join(',\n  ')},\n} from 'better-convex/orm';\n\n`;
    return `${importText}${source}`;
  }

  if (
    !ormImport.importClause?.namedBindings ||
    !ts.isNamedImports(ormImport.importClause.namedBindings)
  ) {
    return source;
  }

  const existingImports = ormImport.importClause.namedBindings.elements.map(
    (element) => element.getText(sourceFile)
  );
  const mergedImports = [...new Set([...existingImports, ...importNames])].sort(
    (a, b) => a.localeCompare(b)
  );
  const nextImport = `import {\n  ${mergedImports.join(',\n  ')},\n} from 'better-convex/orm';`;
  return replaceRange(
    source,
    ormImport.getStart(sourceFile),
    ormImport.end,
    nextImport
  );
};

const hasSchemaFragment = (source: string, tableKey: string) => {
  if (
    new RegExp(`convexTable\\(\\s*['"]${escapeRegex(tableKey)}['"]`).test(
      source
    )
  ) {
    return true;
  }

  const tablesObject = findTablesObject(source);
  if (tablesObject) {
    for (const property of tablesObject.object.properties) {
      if (getPropertyName(property) === tableKey) {
        return true;
      }
    }
  }

  const relationsObject = findRelationsCall(source);
  if (relationsObject) {
    for (const property of relationsObject.object.properties) {
      if (getPropertyName(property) === tableKey) {
        return true;
      }
    }
  }

  return false;
};

const VALID_IDENTIFIER_REGEX = /^[$A-Z_][0-9A-Z_$]*$/i;

export const reconcileRootSchemaOwnership = async (params: {
  claimMatchingManaged?: boolean;
  lock: RootSchemaOwnershipLock | null;
  overwrite: boolean;
  overwriteManaged?: boolean;
  pluginKey: string;
  preview: boolean;
  promptAdapter: PromptAdapter;
  schemaPath: string;
  source: string;
  tables: readonly RootSchemaTableUnit[];
  yes: boolean;
}) => {
  const displayPath = normalizePathForMessage(params.schemaPath);
  const normalizedSource = stripLegacyManagedComments(params.source);
  if (hasStandaloneDefineRelations(normalizedSource)) {
    throw new Error(
      'Schema patch error: use `defineSchema(...).relations(...)` in schema.ts. Root schema patching no longer supports standalone `defineRelations(...)` exports.'
    );
  }

  let nextSource = mergeOrmImports(
    normalizedSource,
    [...new Set(params.tables.flatMap((unit) => unit.importNames))].sort()
  );
  const mergeMeta = new Map<string, SchemaMergeMeta>();
  const registrations: Array<{ key: string; varName: string }> = [];

  for (const unit of params.tables) {
    const hadExistingFragments = hasSchemaFragment(nextSource, unit.key);
    const declarationMerge = mergeTableDeclaration({
      displayPath,
      pluginKey: params.pluginKey,
      source: nextSource,
      unit,
    });
    nextSource = declarationMerge.content;
    mergeMeta.set(unit.key, {
      hadExistingFragments:
        hadExistingFragments || declarationMerge.hadExistingFragments,
    });
    registrations.push({
      key: unit.key,
      varName: declarationMerge.varName,
    });
  }

  nextSource = updateTablesObject(nextSource, registrations);
  nextSource = updateRelationsObject(nextSource, {
    displayPath,
    pluginKey: params.pluginKey,
    tables: params.tables,
  });

  const nextOwnershipEntries: RootSchemaOwnershipLock['tables'] = {};
  for (const unit of params.tables) {
    const existingLockEntry = params.lock?.tables[unit.key];
    const nextChecksum = readManagedChecksumFromSource(nextSource, unit);
    const matchesManaged = nextChecksum === renderManagedChecksum(unit);
    const hadExistingFragments =
      mergeMeta.get(unit.key)?.hadExistingFragments ?? false;

    let nextOwner: PluginRootSchemaTableOwnership;
    if (existingLockEntry?.owner === 'local') {
      nextOwner = { owner: 'local' };
    } else if (existingLockEntry?.owner === 'managed') {
      nextOwner =
        typeof nextChecksum === 'string'
          ? {
              checksum: nextChecksum,
              owner: 'managed',
            }
          : {
              owner: 'local',
            };
    } else if (!hadExistingFragments && matchesManaged && nextChecksum) {
      nextOwner = {
        checksum: nextChecksum,
        owner: 'managed',
      };
    } else if (params.claimMatchingManaged && matchesManaged && nextChecksum) {
      nextOwner = {
        checksum: nextChecksum,
        owner: 'managed',
      };
    } else {
      nextOwner = { owner: 'local' };
    }

    nextOwnershipEntries[unit.key] = nextOwner;
  }

  const desiredKeys = new Set(params.tables.map((unit) => unit.key));
  const manualActions = Object.keys(params.lock?.tables ?? {}).flatMap(
    (tableKey) => {
      if (
        desiredKeys.has(tableKey) ||
        !hasSchemaFragment(nextSource, tableKey)
      ) {
        return [];
      }
      return [
        `${params.pluginKey} no longer defines schema table "${tableKey}" in ${displayPath}. Review and remove stale schema fragments manually if they are no longer needed.`,
      ];
    }
  );

  return {
    content: nextSource.replace(/\n{3,}/g, '\n\n'),
    lock:
      Object.keys(nextOwnershipEntries).length > 0
        ? {
            path: displayPath,
            tables: nextOwnershipEntries,
          }
        : null,
    manualActions,
  };
};
