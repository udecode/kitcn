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

const OBJECT_ENTRY_INDENT = '  ';
const LEADING_INDENT_RE = /^[ \t]*/;
const LEGACY_MANAGED_COMMENT_RE =
  /^[ \t]*\/\* better-convex-managed [^*]+ \*\/\n?/gm;
const WHITESPACE_RE = /\s/;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizePathForMessage = (path: string) => {
  const relativePath = relative(process.cwd(), path).replaceAll('\\', '/');
  return relativePath.startsWith('..')
    ? path.replaceAll('\\', '/')
    : relativePath;
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
  return ts
    .createPrinter({ removeComments: true })
    .printNode(ts.EmitHint.Unspecified, property, sourceFile)
    .trim();
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

const findTableDeclaration = (source: string, tableKey: string) => {
  const sourceFile = parseSource(source);

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.initializer &&
        ts.isCallExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        declaration.initializer.expression.text === 'convexTable'
      ) {
        const firstArg = declaration.initializer.arguments[0];
        if (
          firstArg &&
          isStringLiteralLike(firstArg) &&
          firstArg.text === tableKey
        ) {
          return statement.getText(sourceFile).trim();
        }
      }
    }
  }

  return null;
};

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
  const declaration = findTableDeclaration(source, tableKey);
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
    (element: ts.ImportSpecifier) => element.getText(sourceFile)
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

const removeTableDeclaration = (source: string, tableKey: string) => {
  const sourceFile = parseSource(source);

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.initializer &&
        ts.isCallExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        declaration.initializer.expression.text === 'convexTable'
      ) {
        const firstArg = declaration.initializer.arguments[0];
        if (
          firstArg &&
          isStringLiteralLike(firstArg) &&
          firstArg.text === tableKey
        ) {
          let start = statement.getFullStart();
          while (
            start > 0 &&
            source[start - 1] === '\n' &&
            source[start] === '\n'
          ) {
            start -= 1;
          }
          return replaceRange(source, start, statement.end, '').replace(
            /\n{3,}/g,
            '\n\n'
          );
        }
      }
    }
  }

  return source;
};

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

const updateTablesObject = (
  source: string,
  managedUnits: readonly RootSchemaTableUnit[]
) => {
  const info = findTablesObject(source);
  if (!info) {
    throw new Error(
      'Could not patch schema.ts: expected defineSchema(...) tables.'
    );
  }
  const tablesInfo = info;

  const managedKeys = new Set(managedUnits.map((unit) => unit.key));
  const existingEntries = tablesInfo.object.properties
    .filter((property: ts.ObjectLiteralElementLike) => {
      const propertyKey = getPropertyName(property);
      return !propertyKey || !managedKeys.has(propertyKey);
    })
    .map((property: ts.ObjectLiteralElementLike) =>
      ensureTrailingComma(property.getText(tablesInfo.sourceFile))
    );
  const managedEntries = managedUnits.map((unit) =>
    ensureTrailingComma(unit.registration)
  );

  return replaceRange(
    source,
    tablesInfo.object.getStart(tablesInfo.sourceFile),
    tablesInfo.object.end,
    renderObjectLiteral(
      getIndentAt(source, tablesInfo.object.getStart(tablesInfo.sourceFile)),
      [...existingEntries, ...managedEntries]
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

function removeRelationsCall(
  source: string,
  relationsInfo: RelationsChainInfo
) {
  const propertyAccess = relationsInfo.call.expression;
  if (!ts.isPropertyAccessExpression(propertyAccess)) {
    return source;
  }

  return replaceRange(
    source,
    propertyAccess.expression.end,
    relationsInfo.call.end,
    ''
  ).replace(/\n{3,}/g, '\n\n');
}

const updateRelationsObject = (
  source: string,
  managedUnits: readonly RootSchemaTableUnit[]
) => {
  const relationUnits = managedUnits.filter((unit) => unit.relations);
  const managedKeys = new Set(managedUnits.map((unit) => unit.key));
  const existingRelationsCall = findRelationsCall(source);

  const existingRelations = existingRelationsCall;

  if (!existingRelations) {
    if (relationUnits.length === 0) {
      return source;
    }

    const insertIndex = findRelationsInsertIndex(source);
    if (insertIndex < 0) {
      throw new Error(
        'Could not patch schema.ts: expected defineSchema(...) call chain.'
      );
    }
    const relationEntries = relationUnits.map((unit) =>
      ensureTrailingComma(unit.relations!)
    );
    return `${source.slice(0, insertIndex)}.relations((r) => (${renderObjectLiteral('', relationEntries)}))${source.slice(insertIndex)}`;
  }
  const relationsInfo = existingRelations;

  const existingEntries = relationsInfo.object.properties
    .filter((property: ts.ObjectLiteralElementLike) => {
      const propertyKey = getPropertyName(property);
      return !propertyKey || !managedKeys.has(propertyKey);
    })
    .map((property: ts.ObjectLiteralElementLike) =>
      ensureTrailingComma(property.getText(relationsInfo.sourceFile))
    );
  const managedEntries = relationUnits.map((unit) =>
    ensureTrailingComma(unit.relations!)
  );
  const nextEntries = [...existingEntries, ...managedEntries];

  if (nextEntries.length === 0) {
    return removeRelationsCall(source, relationsInfo);
  }

  return replaceRange(
    source,
    relationsInfo.object.getStart(relationsInfo.sourceFile),
    relationsInfo.object.end,
    renderObjectLiteral(
      getIndentAt(
        source,
        relationsInfo.object.getStart(relationsInfo.sourceFile)
      ),
      nextEntries
    )
  );
};

const insertManagedDeclarations = (
  source: string,
  managedUnits: readonly RootSchemaTableUnit[]
) => {
  if (managedUnits.length === 0) {
    return source;
  }

  const tablesObject = findTablesObject(source);
  if (!tablesObject) {
    throw new Error(
      'Could not patch schema.ts: expected defineSchema(...) tables.'
    );
  }

  const declarationBlocks = managedUnits.map((unit) => unit.declaration.trim());
  return `${source.slice(0, tablesObject.statementStart)}${declarationBlocks.join('\n\n')}\n\n${source.slice(tablesObject.statementStart)}`;
};

const hasLocalConflict = (source: string, tableKey: string) => {
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

const decideOwnership = async (params: {
  claimMatchingManaged?: boolean;
  conflict: boolean;
  displayPath: string;
  drifted: boolean;
  lockEntry?: PluginRootSchemaTableOwnership;
  matchesManaged: boolean;
  overwrite: boolean;
  overwriteManaged?: boolean;
  pluginKey: string;
  preview: boolean;
  promptAdapter: PromptAdapter;
  tableKey: string;
  yes: boolean;
}) => {
  if (params.lockEntry?.owner === 'local') {
    if (params.overwriteManaged) {
      return 'local';
    }
    return params.overwrite ? 'managed' : 'local';
  }

  if (params.lockEntry?.owner === 'managed') {
    if (!params.drifted) {
      return 'managed';
    }
    if (params.overwriteManaged) {
      return 'managed';
    }
    if (params.overwrite) {
      return 'managed';
    }
    if (params.preview) {
      return 'managed';
    }
    if (params.yes || !params.promptAdapter.isInteractive()) {
      throw new Error(
        `Table "${params.tableKey}" has drifted from the managed ${params.pluginKey} schema in ${params.displayPath}. Re-run \`better-convex add ${params.pluginKey}\` interactively or pass --overwrite to replace it.`
      );
    }

    return (await params.promptAdapter.confirm(
      `Overwrite managed ${params.pluginKey} table "${params.tableKey}" in ${params.displayPath}?`
    ))
      ? 'managed'
      : 'local';
  }

  if (!params.conflict) {
    return 'managed';
  }
  if (params.overwrite) {
    return 'managed';
  }
  if (params.claimMatchingManaged) {
    return params.matchesManaged ? 'managed' : 'local';
  }
  if (params.preview) {
    return 'local';
  }
  if (params.yes || !params.promptAdapter.isInteractive()) {
    throw new Error(
      `Table "${params.tableKey}" already exists in ${params.displayPath}. Re-run \`better-convex add ${params.pluginKey}\` interactively or pass --overwrite to let better-convex manage it.`
    );
  }

  return (await params.promptAdapter.confirm(
    `Overwrite existing ${params.pluginKey} table "${params.tableKey}" in ${params.displayPath}?`
  ))
    ? 'managed'
    : 'local';
};

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
  const nextOwnershipEntries: RootSchemaOwnershipLock['tables'] = {};
  const decisions = new Map<string, 'local' | 'managed'>();

  for (const unit of params.tables) {
    const existingLockEntry = params.lock?.tables[unit.key];
    const currentChecksum =
      existingLockEntry?.owner === 'managed' || params.claimMatchingManaged
        ? readManagedChecksumFromSource(normalizedSource, unit)
        : null;
    const matchesManaged = currentChecksum === renderManagedChecksum(unit);
    const drifted =
      existingLockEntry?.owner === 'managed' &&
      (!currentChecksum || currentChecksum !== existingLockEntry.checksum);
    const conflict = hasLocalConflict(normalizedSource, unit.key);
    const owner = await decideOwnership({
      claimMatchingManaged: params.claimMatchingManaged,
      conflict,
      displayPath,
      drifted: Boolean(drifted),
      lockEntry: existingLockEntry,
      matchesManaged,
      overwrite: params.overwrite,
      overwriteManaged: params.overwriteManaged,
      pluginKey: params.pluginKey,
      preview: params.preview,
      promptAdapter: params.promptAdapter,
      tableKey: unit.key,
      yes: params.yes,
    });
    decisions.set(unit.key, owner);
    nextOwnershipEntries[unit.key] =
      owner === 'managed'
        ? {
            checksum: renderManagedChecksum(unit),
            owner: 'managed',
          }
        : {
            owner: 'local',
          };
  }

  const managedUnits = params.tables.filter(
    (unit) => decisions.get(unit.key) === 'managed'
  );
  let nextSource = mergeOrmImports(
    normalizedSource,
    [...new Set(managedUnits.flatMap((unit) => unit.importNames))].sort()
  );

  for (const unit of managedUnits) {
    nextSource = removeTableDeclaration(nextSource, unit.key);
  }

  nextSource = insertManagedDeclarations(nextSource, managedUnits);
  nextSource = updateTablesObject(nextSource, managedUnits);
  nextSource = updateRelationsObject(nextSource, managedUnits);

  return {
    content: nextSource.replace(/\n{3,}/g, '\n\n'),
    lock:
      Object.keys(nextOwnershipEntries).length > 0
        ? {
            path: displayPath,
            tables: nextOwnershipEntries,
          }
        : null,
  };
};
