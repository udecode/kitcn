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
const WHITESPACE_RE = /\s/;

const blockMarker = (
  pluginKey: string,
  tableKey: string,
  section: 'declaration' | 'registration' | 'relations',
  edge: 'end' | 'start'
) => `/* better-convex-managed ${pluginKey}:${tableKey}:${section}:${edge} */`;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizePathForMessage = (path: string) => {
  const relativePath = relative(process.cwd(), path).replaceAll('\\', '/');
  return relativePath.startsWith('..')
    ? path.replaceAll('\\', '/')
    : relativePath;
};

const renderManagedBlock = (
  pluginKey: string,
  tableKey: string,
  section: 'declaration' | 'registration' | 'relations',
  content: string
) =>
  `${blockMarker(pluginKey, tableKey, section, 'start')}\n${content.trim()}\n${blockMarker(pluginKey, tableKey, section, 'end')}`;

const renderManagedObjectEntryFingerprint = (content: string) =>
  indentBlock(ensureTrailingComma(content), OBJECT_ENTRY_INDENT).trim();

const renderManagedFingerprintSource = (unit: RootSchemaTableUnit) =>
  [
    unit.declaration.trim(),
    renderManagedObjectEntryFingerprint(unit.registration),
    unit.relations
      ? renderManagedObjectEntryFingerprint(unit.relations)
      : undefined,
  ]
    .filter(Boolean)
    .join('\n---\n');

const renderManagedChecksum = (unit: RootSchemaTableUnit) =>
  createHash('sha1')
    .update(renderManagedFingerprintSource(unit))
    .digest('hex')
    .slice(0, 12);

const stripManagedBlocks = (source: string, pluginKey: string) =>
  source
    .replace(
      new RegExp(
        `${escapeRegex(
          `/* better-convex-managed ${pluginKey}:`
        )}[\\s\\S]*?${escapeRegex(':end */')}\\n?`,
        'g'
      ),
      ''
    )
    .replace(/\n{3,}/g, '\n\n');

const extractManagedBlockBody = (
  source: string,
  pluginKey: string,
  tableKey: string,
  section: 'declaration' | 'registration' | 'relations'
) => {
  const start = blockMarker(pluginKey, tableKey, section, 'start');
  const end = blockMarker(pluginKey, tableKey, section, 'end');
  const match = source.match(
    new RegExp(
      `${escapeRegex(start)}\\n([\\s\\S]*?)\\n[ \\t]*${escapeRegex(end)}`,
      'm'
    )
  );
  return match?.[1]?.trim();
};

const readManagedChecksumFromSource = (
  source: string,
  pluginKey: string,
  unit: RootSchemaTableUnit
) => {
  const declaration = extractManagedBlockBody(
    source,
    pluginKey,
    unit.key,
    'declaration'
  );
  const registration = extractManagedBlockBody(
    source,
    pluginKey,
    unit.key,
    'registration'
  );
  const relations = unit.relations
    ? extractManagedBlockBody(source, pluginKey, unit.key, 'relations')
    : undefined;

  if (!declaration || !registration || (unit.relations && !relations)) {
    return null;
  }

  return createHash('sha1')
    .update(
      [declaration, registration, relations].filter(Boolean).join('\n---\n')
    )
    .digest('hex')
    .slice(0, 12);
};

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

type RelationsCallInfo = {
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

const findRelationsCall = (source: string): RelationsCallInfo | null => {
  const sourceFile = parseSource(source);
  let result: RelationsCallInfo | null = null;

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
  pluginKey: string,
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
    renderManagedBlock(
      pluginKey,
      unit.key,
      'registration',
      ensureTrailingComma(unit.registration)
    )
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

const updateRelationsObject = (
  source: string,
  pluginKey: string,
  managedUnits: readonly RootSchemaTableUnit[]
) => {
  const relationUnits = managedUnits.filter((unit) => unit.relations);
  const managedKeys = new Set(relationUnits.map((unit) => unit.key));
  const existingRelations = findRelationsCall(source);

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
      renderManagedBlock(
        pluginKey,
        unit.key,
        'relations',
        ensureTrailingComma(unit.relations!)
      )
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
    renderManagedBlock(
      pluginKey,
      unit.key,
      'relations',
      ensureTrailingComma(unit.relations!)
    )
  );
  const nextEntries = [...existingEntries, ...managedEntries];

  if (nextEntries.length === 0) {
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
  pluginKey: string,
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

  const declarationBlocks = managedUnits.map((unit) =>
    renderManagedBlock(pluginKey, unit.key, 'declaration', unit.declaration)
  );
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
  conflict: boolean;
  displayPath: string;
  drifted: boolean;
  lockEntry?: PluginRootSchemaTableOwnership;
  overwrite: boolean;
  overwriteManaged?: boolean;
  pluginKey: string;
  preview: boolean;
  promptAdapter: PromptAdapter;
  tableKey: string;
  yes: boolean;
}) => {
  if (params.lockEntry?.owner === 'local') {
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
  const strippedSource = stripManagedBlocks(params.source, params.pluginKey);
  const nextOwnershipEntries: RootSchemaOwnershipLock['tables'] = {};
  const decisions = new Map<string, 'local' | 'managed'>();

  for (const unit of params.tables) {
    const existingLockEntry = params.lock?.tables[unit.key];
    const currentChecksum =
      existingLockEntry?.owner === 'managed'
        ? readManagedChecksumFromSource(params.source, params.pluginKey, unit)
        : null;
    const drifted =
      existingLockEntry?.owner === 'managed' &&
      (!currentChecksum || currentChecksum !== existingLockEntry.checksum);
    const conflict = hasLocalConflict(strippedSource, unit.key);
    const owner = await decideOwnership({
      conflict,
      displayPath,
      drifted: Boolean(drifted),
      lockEntry: existingLockEntry,
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
    strippedSource,
    [...new Set(managedUnits.flatMap((unit) => unit.importNames))].sort()
  );

  for (const unit of managedUnits) {
    nextSource = removeTableDeclaration(nextSource, unit.key);
  }

  nextSource = insertManagedDeclarations(
    nextSource,
    params.pluginKey,
    managedUnits
  );
  nextSource = updateTablesObject(nextSource, params.pluginKey, managedUnits);
  nextSource = updateRelationsObject(
    nextSource,
    params.pluginKey,
    managedUnits
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
  };
};
