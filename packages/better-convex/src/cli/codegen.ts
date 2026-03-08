import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
import { isValidConvexFile } from '../shared/meta-utils';

/**
 * Generate api.ts with cRPC metadata and client-facing public API refs.
 * Uses runtime imports to extract _crpcMeta from cRPC functions.
 */

type FnMeta = Record<string, unknown>;
type ModuleMeta = Record<string, FnMeta>;
type Meta = Record<string, ModuleMeta>;

/** HTTP route info from _crpcHttpRoute */
type HttpRoute = { path: string; method: string };
type HttpRoutes = Record<string, HttpRoute>;

/** Valid JS identifier pattern for object keys */
const VALID_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
/** Valid JS identifier start pattern */
const IDENTIFIER_START_RE = /^[a-zA-Z_$]/;

/** Pattern to strip .ts extension */
const TS_EXTENSION_RE = /\.ts$/;
/** Pattern to detect default exports in auth contract files. */
const DEFAULT_EXPORT_RE = /\bexport\s+default\b/;
const RUNTIME_CALLER_RESERVED_EXPORTS = new Set(['actions', 'schedule']);

type ApiTreeNode = {
  children: Record<string, ApiTreeNode>;
  functions: Array<{
    fnName: string;
    fnType: 'query' | 'mutation' | 'action';
    moduleName: string;
    fnMeta: FnMeta;
  }>;
};

/** CRPC metadata attached to functions at runtime */
type CRPCMeta = {
  type: 'query' | 'mutation' | 'action';
  internal?: boolean;
  auth?: 'optional' | 'required';
  [key: string]: unknown;
};

type ProcedureMeta = {
  exportName: string;
  internal: boolean;
  type: 'query' | 'mutation' | 'action';
};

type RuntimeEntryKind = 'crpc' | 'dispatch';

type ProcedureRegistryEntry = ProcedureMeta & {
  moduleName: string;
  kind: RuntimeEntryKind;
};

export type CodegenScope = 'all' | 'auth' | 'orm';

const CODEGEN_SCOPES = new Set<CodegenScope>(['all', 'auth', 'orm']);

function normalizeCodegenScope(scope?: string): CodegenScope {
  const normalized = scope ?? 'all';
  if (CODEGEN_SCOPES.has(normalized as CodegenScope)) {
    return normalized as CodegenScope;
  }
  throw new Error(
    `Invalid codegen scope "${normalized}". Expected one of: all, auth, orm.`
  );
}

function shouldGenerateApi(scope: CodegenScope): boolean {
  return scope === 'all';
}

function shouldGenerateAuth(scope: CodegenScope): boolean {
  return scope !== 'orm';
}

function getGenerationLabel(
  generateApi: boolean,
  generateAuth: boolean
): string {
  if (generateApi && generateAuth) {
    return 'all';
  }
  if (!generateApi && generateAuth) {
    return 'auth';
  }
  if (!generateApi && !generateAuth) {
    return 'orm';
  }
  return 'api';
}

function resolveGenerationMode(options?: {
  scope?: CodegenScope | string;
  api?: boolean;
  auth?: boolean;
}): {
  generateApi: boolean;
  generateAuth: boolean;
  modeLabel: string;
} {
  const hasApiToggle = typeof options?.api === 'boolean';
  const hasAuthToggle = typeof options?.auth === 'boolean';

  if (hasApiToggle || hasAuthToggle) {
    const generateApi = options?.api ?? true;
    const generateAuth = options?.auth ?? true;
    return {
      generateApi,
      generateAuth,
      modeLabel: getGenerationLabel(generateApi, generateAuth),
    };
  }

  const scope = normalizeCodegenScope(options?.scope);
  return {
    generateApi: shouldGenerateApi(scope),
    generateAuth: shouldGenerateAuth(scope),
    modeLabel: scope,
  };
}

const AUTH_RUNTIME_PROCEDURES: readonly Omit<
  ProcedureRegistryEntry,
  'moduleName' | 'kind'
>[] = [
  { exportName: 'create', internal: true, type: 'mutation' },
  { exportName: 'deleteMany', internal: true, type: 'mutation' },
  { exportName: 'deleteOne', internal: true, type: 'mutation' },
  { exportName: 'findMany', internal: true, type: 'query' },
  { exportName: 'findOne', internal: true, type: 'query' },
  { exportName: 'getLatestJwks', internal: true, type: 'action' },
  { exportName: 'rotateKeys', internal: true, type: 'action' },
  { exportName: 'updateMany', internal: true, type: 'mutation' },
  { exportName: 'updateOne', internal: true, type: 'mutation' },
];

const GENERATED_SERVER_RUNTIME_PROCEDURES: readonly Omit<
  ProcedureRegistryEntry,
  'moduleName' | 'kind'
>[] = [
  { exportName: 'scheduledMutationBatch', internal: true, type: 'mutation' },
  { exportName: 'scheduledDelete', internal: true, type: 'mutation' },
  { exportName: 'aggregateBackfill', internal: true, type: 'mutation' },
  { exportName: 'aggregateBackfillChunk', internal: true, type: 'mutation' },
  { exportName: 'aggregateBackfillStatus', internal: true, type: 'mutation' },
  { exportName: 'migrationRun', internal: true, type: 'mutation' },
  { exportName: 'migrationRunChunk', internal: true, type: 'mutation' },
  { exportName: 'migrationStatus', internal: true, type: 'mutation' },
  { exportName: 'migrationCancel', internal: true, type: 'mutation' },
  { exportName: 'resetChunk', internal: true, type: 'mutation' },
  { exportName: 'reset', internal: true, type: 'action' },
];

function listFilesRecursive(cwd: string, relDir = ''): string[] {
  const absDir = path.join(cwd, relDir);
  const entries = fs.readdirSync(absDir, { withFileTypes: true });

  const files: string[] = [];
  for (const entry of entries) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(cwd, relPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(relPath);
    }
  }
  return files;
}

function ensureRelativeImportPath(value: string): string {
  if (value.startsWith('.') || value.startsWith('/')) {
    return value;
  }
  return `./${value}`;
}

function normalizeImportPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function formatKey(key: string): string {
  return VALID_IDENTIFIER_RE.test(key) ? key : `'${key}'`;
}

function toPascalCaseToken(token: string): string {
  if (token.length === 0) {
    return '';
  }
  return `${token[0]?.toUpperCase() ?? ''}${token.slice(1)}`;
}

function getModuleRuntimeExportBase(moduleName: string): string {
  const base = moduleName
    .split('/')
    .filter(Boolean)
    .flatMap((segment) =>
      segment
        .split(/[^a-zA-Z0-9]+/g)
        .filter(Boolean)
        .map((token) => toPascalCaseToken(token))
    )
    .join('');

  if (base.length === 0) {
    return 'Module';
  }

  return IDENTIFIER_START_RE.test(base) ? base : `M${base}`;
}

function getModuleRuntimeExportNames(moduleName: string): {
  callerExportName: string;
  handlerExportName: string;
} {
  if (moduleName === 'generated/server') {
    return {
      callerExportName: 'createServerCaller',
      handlerExportName: 'createServerHandler',
    };
  }
  const base = getModuleRuntimeExportBase(moduleName);
  return {
    callerExportName: `create${base}Caller`,
    handlerExportName: `create${base}Handler`,
  };
}

function getAccessPath(base: string, segments: string[]): string {
  return segments.reduce(
    (acc, segment) => `${acc}[${JSON.stringify(segment)}]`,
    base
  );
}

function getModuleImportPath(
  outputFile: string,
  functionsDir: string,
  moduleName: string
): string {
  const moduleFile = path.join(functionsDir, moduleName);
  const relativePath = path.relative(path.dirname(outputFile), moduleFile);
  return ensureRelativeImportPath(normalizeImportPath(relativePath));
}

function getRuntimeApiImportPath(
  outputFile: string,
  functionsDir: string
): string {
  const runtimeApiFile = path.join(functionsDir, '_generated', 'api.js');
  const relativePath = path.relative(path.dirname(outputFile), runtimeApiFile);
  return ensureRelativeImportPath(normalizeImportPath(relativePath));
}

function getSchemaImportPath(outputFile: string, functionsDir: string): string {
  const schemaFile = path.join(functionsDir, 'schema');
  const relativePath = path.relative(path.dirname(outputFile), schemaFile);
  return ensureRelativeImportPath(normalizeImportPath(relativePath));
}

function getServerTypesImportPath(
  outputFile: string,
  functionsDir: string
): string {
  const serverTypesFile = path.join(functionsDir, '_generated', 'server');
  const relativePath = path.relative(path.dirname(outputFile), serverTypesFile);
  return ensureRelativeImportPath(normalizeImportPath(relativePath));
}

function getDataModelImportPath(
  outputFile: string,
  functionsDir: string
): string {
  const dataModelFile = path.join(functionsDir, '_generated', 'dataModel');
  const relativePath = path.relative(path.dirname(outputFile), dataModelFile);
  return ensureRelativeImportPath(normalizeImportPath(relativePath));
}

function getHttpImportPath(outputFile: string, functionsDir: string): string {
  const httpFile = path.join(functionsDir, 'http');
  const relativePath = path.relative(path.dirname(outputFile), httpFile);
  return ensureRelativeImportPath(normalizeImportPath(relativePath));
}

const GENERATED_DIR = 'generated';

function getGeneratedServerOutputFile(functionsDir: string): string {
  return path.join(functionsDir, GENERATED_DIR, 'server.ts');
}

function getGeneratedAuthOutputFile(functionsDir: string): string {
  return path.join(functionsDir, GENERATED_DIR, 'auth.ts');
}

function getGeneratedMigrationsHelperOutputFile(functionsDir: string): string {
  return path.join(functionsDir, GENERATED_DIR, 'migrations.gen.ts');
}

function getLegacyGeneratedOutputFile(functionsDir: string): string {
  return path.join(functionsDir, 'generated.ts');
}

function getModuleNameFromOutputFile(
  outputFile: string,
  functionsDir: string
): string {
  const relativePath = normalizeImportPath(
    path.relative(functionsDir, outputFile)
  );
  return relativePath.replace(TS_EXTENSION_RE, '');
}

function getGeneratedServerImportPath(
  outputFile: string,
  functionsDir: string
): string {
  const generatedServerFile = getGeneratedServerOutputFile(functionsDir);
  const relativePath = path.relative(
    path.dirname(outputFile),
    generatedServerFile
  );
  const normalizedPath = normalizeImportPath(relativePath).replace(
    TS_EXTENSION_RE,
    ''
  );
  return ensureRelativeImportPath(normalizedPath);
}

function getGeneratedRuntimeOutputFile(
  functionsDir: string,
  moduleName: string
): string {
  const runtimeModuleName = moduleName.startsWith(`${GENERATED_DIR}/`)
    ? moduleName.slice(GENERATED_DIR.length + 1)
    : moduleName;
  return path.join(
    functionsDir,
    GENERATED_DIR,
    `${runtimeModuleName}.runtime.ts`
  );
}

function emitGeneratedServerPlaceholderFile(): string {
  return `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

import { initCRPC as baseInitCRPC } from 'better-convex/server';

export type QueryCtx = unknown;
export type MutationCtx = unknown;
export type ActionCtx = unknown;
export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;
export type OrmCtx<Ctx = QueryCtx> = Ctx;

export const orm = {} as Record<string, unknown>;
export const scheduledMutationBatch = undefined as unknown;
export const scheduledDelete = undefined as unknown;
export const migrationRun = undefined as unknown;
export const migrationRunChunk = undefined as unknown;
export const migrationStatus = undefined as unknown;
export const migrationCancel = undefined as unknown;
export const initCRPC = baseInitCRPC;

export function withOrm<Ctx>(ctx: Ctx): Ctx {
  return ctx;
}
`;
}

function emitGeneratedAuthPlaceholderFile(): string {
  return `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

export function defineAuth<TDefinition>(definition: TDefinition): TDefinition {
  return definition;
}

export const authEnabled = false;
export const authClient = {} as Record<string, unknown>;
export const getAuth = () => ({} as Record<string, unknown>);
export const auth = {} as Record<string, unknown>;
`;
}

function emitGeneratedMigrationsPlaceholderFile(): string {
  return `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

export { defineMigration } from 'better-convex/orm';
`;
}

function ensureGeneratedSupportPlaceholders(
  functionsDir: string,
  options?: { includeAuth?: boolean }
): void {
  const serverOutputFile = getGeneratedServerOutputFile(functionsDir);
  const authOutputFile = getGeneratedAuthOutputFile(functionsDir);
  const migrationsHelperOutputFile =
    getGeneratedMigrationsHelperOutputFile(functionsDir);
  const generatedDir = path.dirname(serverOutputFile);
  fs.mkdirSync(generatedDir, { recursive: true });
  const includeAuth = options?.includeAuth ?? true;

  if (!fs.existsSync(serverOutputFile)) {
    fs.writeFileSync(serverOutputFile, emitGeneratedServerPlaceholderFile());
  }

  if (includeAuth && !fs.existsSync(authOutputFile)) {
    fs.writeFileSync(authOutputFile, emitGeneratedAuthPlaceholderFile());
  }

  if (!fs.existsSync(migrationsHelperOutputFile)) {
    fs.writeFileSync(
      migrationsHelperOutputFile,
      emitGeneratedMigrationsPlaceholderFile()
    );
  }
}

function emitGeneratedRuntimePlaceholderFile(moduleName: string): string {
  const { callerExportName, handlerExportName } =
    getModuleRuntimeExportNames(moduleName);
  return `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

export function ${callerExportName}(_ctx: unknown) {
  throw new Error('[better-convex] Runtime caller is not generated yet. Run better-convex codegen.');
}

export function ${handlerExportName}(_ctx: unknown) {
  throw new Error('[better-convex] Runtime handler is not generated yet. Run better-convex codegen.');
}
`;
}

function ensureGeneratedRuntimePlaceholders(
  functionsDir: string,
  moduleNames: string[]
): string[] {
  const createdPlaceholderFiles: string[] = [];
  for (const moduleName of moduleNames) {
    const runtimeOutputFile = getGeneratedRuntimeOutputFile(
      functionsDir,
      moduleName
    );
    if (fs.existsSync(runtimeOutputFile)) {
      continue;
    }
    fs.mkdirSync(path.dirname(runtimeOutputFile), { recursive: true });
    fs.writeFileSync(
      runtimeOutputFile,
      emitGeneratedRuntimePlaceholderFile(moduleName)
    );
    createdPlaceholderFiles.push(runtimeOutputFile);
  }
  return createdPlaceholderFiles;
}

function listGeneratedRuntimeFiles(functionsDir: string): string[] {
  const generatedDir = path.join(functionsDir, 'generated');
  if (!fs.existsSync(generatedDir)) {
    return [];
  }
  return listFilesRecursive(generatedDir)
    .filter((file) => file.endsWith('.runtime.ts'))
    .map((file) => path.join(generatedDir, file));
}

type GeneratedAuthContract = {
  hasAuthFile: boolean;
  hasAuthDefaultExport: boolean;
};

function emitGeneratedServerFile(
  outputFile: string,
  functionsDir: string,
  hasRelationsExport: boolean,
  hasTriggersExport: boolean,
  hasMigrationsManifest: boolean
): string {
  const asSingleQuotedImport = (importPath: string) =>
    `'${importPath.replaceAll("'", "\\'")}'`;
  const serverTypesImportPath = getServerTypesImportPath(
    outputFile,
    functionsDir
  );
  const dataModelImportPath = getDataModelImportPath(outputFile, functionsDir);
  const runtimeApiImportPath = getRuntimeApiImportPath(
    outputFile,
    functionsDir
  );
  const schemaImportPath = getSchemaImportPath(outputFile, functionsDir);
  const migrationsManifestImportPath = getModuleImportPath(
    outputFile,
    functionsDir,
    'migrations/manifest'
  );
  const serverTypesImportLiteral = asSingleQuotedImport(serverTypesImportPath);
  const dataModelImportLiteral = asSingleQuotedImport(dataModelImportPath);
  const runtimeApiImportLiteral = asSingleQuotedImport(runtimeApiImportPath);
  const schemaImportLiteral = asSingleQuotedImport(schemaImportPath);
  const migrationsManifestImportLiteral = asSingleQuotedImport(
    migrationsManifestImportPath
  );
  if (!hasRelationsExport) {
    return `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

import { initCRPC as baseInitCRPC } from 'better-convex/server';
import type { DataModel } from ${dataModelImportLiteral};
import type {
  ActionCtx as ServerActionCtx,
  MutationCtx as ServerMutationCtx,
  QueryCtx as ServerQueryCtx,
} from ${serverTypesImportLiteral};

export type QueryCtx = ServerQueryCtx;
export type MutationCtx = ServerMutationCtx;
export type ActionCtx = ServerActionCtx;
export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;
export const initCRPC = baseInitCRPC.dataModel<DataModel>();
`;
  }

  const moduleNamespace = getModuleNameFromOutputFile(outputFile, functionsDir);
  const ormFunctionsAccessor = getAccessPath(
    '(internal as unknown as Record<string, any>)',
    moduleNamespace.split('/').filter(Boolean)
  );

  const schemaNamedImports = hasTriggersExport
    ? 'relations, triggers'
    : 'relations';
  const triggersConfigLine = hasTriggersExport ? '  triggers,\n' : '';
  const migrationsImportLine = hasMigrationsManifest
    ? `import { migrations } from ${migrationsManifestImportLiteral};\n`
    : '';
  const migrationsConfigLine = hasMigrationsManifest ? '  migrations,\n' : '';

  return `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

import { createOrm, type GenericOrmCtx, type OrmFunctions } from 'better-convex/orm';
import { initCRPC as baseInitCRPC } from 'better-convex/server';
import { internal } from ${runtimeApiImportLiteral};
import type { DataModel } from ${dataModelImportLiteral};
import type {
  ActionCtx as ServerActionCtx,
  MutationCtx as ServerMutationCtx,
  QueryCtx as ServerQueryCtx,
} from ${serverTypesImportLiteral};
import { internalMutation } from ${serverTypesImportLiteral};
import schema, { ${schemaNamedImports} } from ${schemaImportLiteral};
${migrationsImportLine}

const ormFunctions = ${ormFunctionsAccessor} as OrmFunctions;

export const orm = createOrm({
  schema: relations,
${triggersConfigLine}  ormFunctions,
${migrationsConfigLine}  internalMutation,
});

export type OrmCtx<Ctx extends ServerQueryCtx | ServerMutationCtx = ServerQueryCtx> = GenericOrmCtx<Ctx, typeof relations>;
export type QueryCtx = OrmCtx<ServerQueryCtx>;
export type MutationCtx = OrmCtx<ServerMutationCtx>;
export type ActionCtx = ServerActionCtx;
export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;

export function withOrm<Ctx extends ServerQueryCtx | ServerMutationCtx>(ctx: Ctx) {
  return orm.with(ctx) as OrmCtx<Ctx>;
}

export const initCRPC = baseInitCRPC.dataModel<DataModel>().context({
  query: (ctx) => withOrm(ctx),
  mutation: (ctx) => withOrm(ctx),
});

export const {
  scheduledMutationBatch,
  scheduledDelete,
  aggregateBackfill,
  aggregateBackfillChunk,
  aggregateBackfillStatus,
  migrationRun,
  migrationRunChunk,
  migrationStatus,
  migrationCancel,
  resetChunk,
  reset,
} = orm.api();
`;
}

function emitGeneratedAuthFile(
  outputFile: string,
  functionsDir: string,
  hasRelationsExport: boolean,
  authContract: GeneratedAuthContract
): string {
  const asSingleQuotedImport = (importPath: string) =>
    `'${importPath.replaceAll("'", "\\'")}'`;
  const runtimeApiImportPath = getRuntimeApiImportPath(
    outputFile,
    functionsDir
  );
  const dataModelImportPath = getDataModelImportPath(outputFile, functionsDir);
  const schemaImportPath = getSchemaImportPath(outputFile, functionsDir);
  const serverImportPath = getGeneratedServerImportPath(
    outputFile,
    functionsDir
  );
  const moduleNamespace = getModuleNameFromOutputFile(outputFile, functionsDir);
  const authDefinitionImportPath = getModuleImportPath(
    outputFile,
    functionsDir,
    'auth'
  );
  const runtimeApiImportLiteral = asSingleQuotedImport(runtimeApiImportPath);
  const dataModelImportLiteral = asSingleQuotedImport(dataModelImportPath);
  const schemaImportLiteral = asSingleQuotedImport(schemaImportPath);
  const serverImportLiteral = asSingleQuotedImport(serverImportPath);
  const authDefinitionImportLiteral = asSingleQuotedImport(
    authDefinitionImportPath
  );
  const hasAuthFile = authContract.hasAuthFile;
  const hasAuthDefaultExport = authContract.hasAuthDefaultExport;
  const disabledAuthReasonKind = hasAuthFile
    ? hasAuthDefaultExport
      ? 'default_export_unavailable'
      : 'missing_default_export'
    : 'missing_auth_file';
  const authRuntimeImportSpecifiers = [
    'type BetterAuthOptionsWithoutDatabase',
    'defineAuth as baseDefineAuth',
    'createAuthRuntime',
    'type GenericAuthDefinition',
    'getGeneratedAuthDisabledReason',
    hasAuthDefaultExport
      ? 'resolveGeneratedAuthDefinition'
      : 'createDisabledAuthRuntime',
  ];
  const authRuntimeImports = `import {
  ${authRuntimeImportSpecifiers.join(',\n  ')},
} from 'better-convex/auth';`;
  const authDefinitionImport = hasAuthDefaultExport
    ? `import * as authDefinitionModule from ${authDefinitionImportLiteral};`
    : '';
  const runtimeApiImport = hasAuthDefaultExport
    ? `import { internal } from ${runtimeApiImportLiteral};`
    : '';
  const withOrmImport =
    hasRelationsExport && hasAuthDefaultExport
      ? `import { withOrm } from ${serverImportLiteral};`
      : '';

  return `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

${authRuntimeImports}
${runtimeApiImport}
import type { DataModel } from ${dataModelImportLiteral};
import type { GenericCtx, MutationCtx } from ${serverImportLiteral};
${withOrmImport}
import schema from ${schemaImportLiteral};
${authDefinitionImport}

export function defineAuth<
  AuthOptions extends BetterAuthOptionsWithoutDatabase = BetterAuthOptionsWithoutDatabase,
>(
  definition: GenericAuthDefinition<GenericCtx, DataModel, typeof schema, AuthOptions>
) {
  return baseDefineAuth(definition);
}

${
  hasAuthDefaultExport
    ? `type AuthDefinitionFromFile = Extract<
  typeof authDefinitionModule extends { default: infer T } ? T : never,
  (...args: unknown[]) => unknown
>;

const authDefinition = ((ctx: GenericCtx) =>
  resolveGeneratedAuthDefinition<AuthDefinitionFromFile>(
    authDefinitionModule,
    getGeneratedAuthDisabledReason(${JSON.stringify(disabledAuthReasonKind)})
  )(ctx)) as AuthDefinitionFromFile;
`
    : ''
}
const authRuntime = ${
    hasAuthDefaultExport
      ? `createAuthRuntime<
  DataModel,
  typeof schema,
  MutationCtx,
  GenericCtx,
  ReturnType<AuthDefinitionFromFile>
>({
  internal,
  moduleName: ${JSON.stringify(moduleNamespace)},
  schema,
  auth: authDefinition,${hasRelationsExport ? '\n  context: withOrm,' : ''}
})`
      : `createDisabledAuthRuntime<DataModel, typeof schema, MutationCtx, GenericCtx>({
  reason: getGeneratedAuthDisabledReason(${JSON.stringify(disabledAuthReasonKind)}),
})`
  };

export const {
  authEnabled,
  authClient,
  getAuth,
  auth,
  create,
  deleteMany,
  deleteOne,
  findMany,
  findOne,
  updateMany,
  updateOne,
  getLatestJwks,
  rotateKeys,
} = authRuntime;
`;
}

function emitGeneratedMigrationsFile(
  outputFile: string,
  functionsDir: string,
  hasRelationsExport: boolean
): string {
  const asSingleQuotedImport = (importPath: string) =>
    `'${importPath.replaceAll("'", "\\'")}'`;
  const schemaImportPath = getSchemaImportPath(outputFile, functionsDir);
  const schemaImportLiteral = asSingleQuotedImport(schemaImportPath);

  if (!hasRelationsExport) {
    return `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

export { defineMigration } from 'better-convex/orm';
`;
  }

  return `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

import {
  defineMigration as baseDefineMigration,
  type MigrationDefinition,
} from 'better-convex/orm';
import { relations } from ${schemaImportLiteral};

export function defineMigration(
  migration: MigrationDefinition<typeof relations>
): MigrationDefinition<typeof relations> {
  return baseDefineMigration<typeof relations>(migration);
}
`;
}

function emitGeneratedModuleRuntimeFile(
  outputFile: string,
  functionsDir: string,
  moduleName: string,
  procedureEntries: ProcedureRegistryEntry[]
): string {
  const { callerExportName, handlerExportName } =
    getModuleRuntimeExportNames(moduleName);
  const runtimeApiImportPath = getRuntimeApiImportPath(
    outputFile,
    functionsDir
  );
  const generatedServerImportPath = getGeneratedServerImportPath(
    outputFile,
    functionsDir
  );
  const { callerEntries, handlerEntries } =
    partitionRuntimeEntriesForEmission(procedureEntries);
  const callerRegistryLines = emitProcedureRegistryEntries(
    callerEntries,
    outputFile,
    functionsDir,
    moduleName
  );
  const callerRegistryBody =
    callerRegistryLines.length > 0
      ? `\n${callerRegistryLines.join('\n')}\n`
      : '\n';
  const hasHandlerRegistry = handlerEntries.length > 0;
  const handlerRegistryLines = hasHandlerRegistry
    ? emitProcedureRegistryEntries(
        handlerEntries,
        outputFile,
        functionsDir,
        moduleName
      )
    : [];
  const handlerRegistryBody =
    handlerRegistryLines.length > 0
      ? `\n${handlerRegistryLines.join('\n')}\n`
      : '\n';
  const allEntriesAreCrpc =
    callerEntries.length > 0 && callerEntries.length === handlerEntries.length;
  const handlerRegistryDeclaration = hasHandlerRegistry
    ? allEntriesAreCrpc
      ? '\n  const handlerRegistry = procedureRegistry;\n'
      : `\n  const handlerRegistry = {${handlerRegistryBody}} as const;\n`
    : '';
  const handlerTypeDeclarations = hasHandlerRegistry
    ? `
type ProcedureHandlerContext = QueryCtx | MutationCtx;
type GeneratedProcedureHandler<
  TCtx extends ProcedureHandlerContext = ProcedureHandlerContext,
> = TCtx extends MutationCtx
  ? ProcedureCallerFromRegistry<ProcedureHandlerRegistry, 'mutation'>
  : ProcedureCallerFromRegistry<ProcedureHandlerRegistry, 'query'>;
`
    : '';
  const handlerFactoryHelpers = hasHandlerRegistry
    ? `
function createHandlerFromRegistryFactory() {
  const { createGenericHandlerFactory } =
    (require('better-convex/server') as RuntimeServerModule);
  const { handlerRegistry } = buildProcedureRegistry();
  return createGenericHandlerFactory<
    QueryCtx,
    MutationCtx,
    ProcedureHandlerRegistry
  >(handlerRegistry);
}

type HandlerFactory = ReturnType<typeof createHandlerFromRegistryFactory>;

let cachedCreateHandlerFromRegistry: HandlerFactory | undefined;

function getCreateHandlerFromRegistry(): HandlerFactory {
  if (cachedCreateHandlerFromRegistry) {
    return cachedCreateHandlerFromRegistry;
  }

  const generatedHandlerFactory = createHandlerFromRegistryFactory();
  cachedCreateHandlerFromRegistry = generatedHandlerFactory;

  return generatedHandlerFactory;
}

`
    : '';
  const handlerExport = hasHandlerRegistry
    ? `
export function ${handlerExportName}<TCtx extends ProcedureHandlerContext>(
  ctx: TCtx
): GeneratedProcedureHandler<TCtx> {
  const createHandlerFromRegistry = getCreateHandlerFromRegistry();
  return createHandlerFromRegistry(ctx) as GeneratedProcedureHandler<TCtx>;
}
`
    : '';

  return `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

import type {
  ProcedureActionCallerFromRegistry,
  ProcedureCallerFromRegistry,
  ProcedureScheduleCallerFromRegistry,
} from 'better-convex/server';
import type { ActionCtx, MutationCtx, QueryCtx } from '${generatedServerImportPath}';
import type { OrmTriggerContext } from 'better-convex/orm';

type RuntimeServerModule = typeof import('better-convex/server');

function createProcedureRegistry() {
  const { typedProcedureResolver } =
    (require('better-convex/server') as RuntimeServerModule);
  const { api, internal } =
    (require(${JSON.stringify(runtimeApiImportPath)}) as typeof import('${runtimeApiImportPath}'));

  const procedureRegistry = {${callerRegistryBody}} as const;
${handlerRegistryDeclaration}
  return {
    procedureRegistry,
${hasHandlerRegistry ? '    handlerRegistry,\n' : ''}  };
}

type ProcedureRegistryBundle = ReturnType<typeof createProcedureRegistry>;
type ProcedureCallerRegistry = ProcedureRegistryBundle['procedureRegistry'];
${
  hasHandlerRegistry
    ? `type ProcedureHandlerRegistry = ProcedureRegistryBundle['handlerRegistry'];
`
    : ''
}

let cachedProcedureRegistry: ProcedureRegistryBundle | undefined;

function buildProcedureRegistry(): ProcedureRegistryBundle {
  if (cachedProcedureRegistry) {
    return cachedProcedureRegistry;
  }

  const procedureRegistryBundle = createProcedureRegistry();
  cachedProcedureRegistry = procedureRegistryBundle;

  return procedureRegistryBundle;
}

type MutationCallerContext = MutationCtx | OrmTriggerContext<any, MutationCtx>;
type ProcedureCallerContext = QueryCtx | MutationCallerContext | ActionCtx;
type GeneratedProcedureCaller<
  TCtx extends ProcedureCallerContext = ProcedureCallerContext,
> = TCtx extends MutationCallerContext
  ? ProcedureCallerFromRegistry<ProcedureCallerRegistry, 'mutation'> & {
      schedule: ProcedureScheduleCallerFromRegistry<ProcedureCallerRegistry>;
    }
  : TCtx extends ActionCtx
    ? ProcedureCallerFromRegistry<ProcedureCallerRegistry, 'mutation'> & {
        actions: ProcedureActionCallerFromRegistry<ProcedureCallerRegistry>;
        schedule: ProcedureScheduleCallerFromRegistry<ProcedureCallerRegistry>;
      }
    : ProcedureCallerFromRegistry<ProcedureCallerRegistry, 'query'>;
${handlerTypeDeclarations}

function createCallerFromRegistryFactory() {
  const { createGenericCallerFactory } =
    (require('better-convex/server') as RuntimeServerModule);
  const { procedureRegistry } = buildProcedureRegistry();
  return createGenericCallerFactory<
    QueryCtx,
    MutationCtx,
    ProcedureCallerRegistry,
    ActionCtx
  >(procedureRegistry);
}

type CallerFactory = ReturnType<typeof createCallerFromRegistryFactory>;

let cachedCreateCallerFromRegistry: CallerFactory | undefined;

function getCreateCallerFromRegistry(): CallerFactory {
  if (cachedCreateCallerFromRegistry) {
    return cachedCreateCallerFromRegistry;
  }

  const generatedCallerFactory = createCallerFromRegistryFactory();
  cachedCreateCallerFromRegistry = generatedCallerFactory;

  return generatedCallerFactory;
}

${handlerFactoryHelpers}

export function ${callerExportName}<TCtx extends ProcedureCallerContext>(
  ctx: TCtx
): GeneratedProcedureCaller<TCtx> {
  const createCallerFromRegistry = getCreateCallerFromRegistry();
  return createCallerFromRegistry(ctx) as GeneratedProcedureCaller<TCtx>;
}
${handlerExport}
`;
}

function hasNamedExport(filePath: string, exportName: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const source = fs.readFileSync(filePath, 'utf-8');
  const directPattern = new RegExp(
    `\\bexport\\s+(?:const|let|var|function|class|type|interface)\\s+${exportName}\\b`
  );
  if (directPattern.test(source)) {
    return true;
  }

  const namedExportsPattern = /\bexport\s*{([^}]*)}/g;
  for (const match of source.matchAll(namedExportsPattern)) {
    const exportList = match[1] ?? '';
    const listPattern = new RegExp(`\\b${exportName}\\b`);
    if (listPattern.test(exportList)) {
      return true;
    }
  }

  return false;
}

function hasDefaultExport(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const source = fs.readFileSync(filePath, 'utf-8');
  return DEFAULT_EXPORT_RE.test(source);
}

function createApiTree(meta: Meta): ApiTreeNode {
  const root: ApiTreeNode = { children: {}, functions: [] };

  for (const [moduleName, fns] of Object.entries(meta)) {
    const pathSegments = moduleName.split('/').filter(Boolean);
    let node = root;

    for (const segment of pathSegments) {
      node.children[segment] ??= { children: {}, functions: [] };
      node = node.children[segment]!;
    }

    for (const fnName of Object.keys(fns).sort()) {
      const fnMeta = fns[fnName] ?? {};
      const type = fnMeta.type;
      const fnType =
        type === 'query' || type === 'mutation' || type === 'action'
          ? type
          : 'query';
      node.functions.push({
        fnName,
        fnType,
        moduleName,
        fnMeta: {
          ...fnMeta,
          type: fnType,
        },
      });
    }
  }

  return root;
}

function formatMetaValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  return null;
}

function emitFnMetaLiteral(fnMeta: FnMeta): string {
  const metaProps: string[] = [];
  for (const [key, value] of Object.entries(fnMeta).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (value === undefined) continue;
    const formatted = formatMetaValue(value);
    if (formatted !== null) {
      metaProps.push(`${key}: ${formatted}`);
    }
  }

  return `{ ${metaProps.join(', ')} }`;
}

function emitHttpRoutes(
  dedupedRoutes: Record<string, HttpRoute>,
  indentLevel: number
): string[] {
  const indent = '  '.repeat(indentLevel);
  const lines: string[] = [];
  for (const [routeKey, route] of Object.entries(dedupedRoutes).sort(
    ([a], [b]) => a.localeCompare(b)
  )) {
    lines.push(
      `${indent}${formatKey(routeKey)}: { path: ${JSON.stringify(route.path)}, method: ${JSON.stringify(route.method)} },`
    );
  }
  return lines;
}

function emitApiObject(
  tree: ApiTreeNode,
  pathSegments: string[],
  outputFile: string,
  functionsDir: string,
  indentLevel: number,
  dedupedRoutes: Record<string, HttpRoute>,
  hasHttpRouterExport: boolean
): string[] {
  const indent = '  '.repeat(indentLevel);
  const lines: string[] = [];

  const childKeys = Object.keys(tree.children).sort((a, b) =>
    a.localeCompare(b)
  );
  const functionEntries = [...tree.functions].sort((a, b) =>
    a.fnName.localeCompare(b.fnName)
  );

  const childSet = new Set(childKeys);
  for (const entry of functionEntries) {
    if (childSet.has(entry.fnName)) {
      throw new Error(
        `Codegen conflict at ${pathSegments.join('/')}: export "${entry.fnName}" conflicts with directory of same name.`
      );
    }
  }

  const mergedKeys = [
    ...childKeys,
    ...functionEntries.map((entry) => entry.fnName),
  ].sort((a, b) => a.localeCompare(b));

  for (const key of mergedKeys) {
    if (childSet.has(key)) {
      const childNode = tree.children[key]!;
      lines.push(`${indent}${formatKey(key)}: {`);
      lines.push(
        ...emitApiObject(
          childNode,
          [...pathSegments, key],
          outputFile,
          functionsDir,
          indentLevel + 1,
          dedupedRoutes,
          hasHttpRouterExport
        )
      );
      lines.push(`${indent}},`);
      continue;
    }

    const fnEntry = functionEntries.find((entry) => entry.fnName === key);
    if (!fnEntry) continue;

    const runtimeAccess = getAccessPath('convexApi', [...pathSegments, key]);
    const moduleImportPath = getModuleImportPath(
      outputFile,
      functionsDir,
      fnEntry.moduleName
    );
    const fnMetaLiteral = emitFnMetaLiteral(fnEntry.fnMeta);

    lines.push(
      `${indent}${formatKey(key)}: createApiLeaf<${JSON.stringify(fnEntry.fnType)}, typeof import(${JSON.stringify(moduleImportPath)}).${key}>(${runtimeAccess}, ${fnMetaLiteral}),`
    );
  }

  if (pathSegments.length === 0) {
    if (hasHttpRouterExport) {
      lines.push(`${indent}http: undefined as unknown as typeof httpRouter,`);
    }
    lines.push(`${indent}_http: {`);
    lines.push(...emitHttpRoutes(dedupedRoutes, indentLevel + 1));
    lines.push(`${indent}},`);
  }

  return lines;
}

function emitProcedureRegistryEntries(
  entries: ProcedureRegistryEntry[],
  outputFile: string,
  functionsDir: string,
  moduleName: string
): string[] {
  return entries
    .map((entry) => {
      const pathKey =
        entry.moduleName === moduleName
          ? entry.exportName
          : [...entry.moduleName.split('/'), entry.exportName].join('.');
      const moduleImportPath = getModuleImportPath(
        outputFile,
        functionsDir,
        entry.moduleName
      );
      const functionRefAccess = getAccessPath(
        entry.internal ? 'internal' : 'api',
        [...entry.moduleName.split('/'), entry.exportName]
      );
      const resolver = `(require(${JSON.stringify(moduleImportPath)}) as Record<string, unknown>)[${JSON.stringify(entry.exportName)}]`;
      return `  ${JSON.stringify(pathKey)}: [${JSON.stringify(entry.type)}, typedProcedureResolver(${functionRefAccess}, () => ${resolver})],`;
    })
    .sort((a, b) => a.localeCompare(b));
}

function buildAuthRuntimeProcedureEntries(
  moduleName: string
): ProcedureRegistryEntry[] {
  return AUTH_RUNTIME_PROCEDURES.map((entry) => ({
    ...entry,
    moduleName,
    kind: 'crpc',
  }));
}

function buildGeneratedServerRuntimeProcedureEntries(
  moduleName: string
): ProcedureRegistryEntry[] {
  return GENERATED_SERVER_RUNTIME_PROCEDURES.map((entry) => ({
    ...entry,
    moduleName,
    kind: 'dispatch',
  }));
}

function partitionRuntimeEntriesForEmission(
  entries: ProcedureRegistryEntry[]
): {
  callerEntries: ProcedureRegistryEntry[];
  handlerEntries: ProcedureRegistryEntry[];
} {
  return {
    callerEntries: entries,
    handlerEntries: entries.filter((entry) => entry.kind === 'crpc'),
  };
}

function dedupeProcedureEntries(
  entries: ProcedureRegistryEntry[]
): ProcedureRegistryEntry[] {
  const seen = new Set<string>();
  const deduped: ProcedureRegistryEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.moduleName}.${entry.exportName}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

export function getConvexConfig(outputDir?: string): {
  functionsDir: string;
  outputFile: string;
} {
  const convexConfigPath = path.join(process.cwd(), 'convex.json');
  const convexConfig = fs.existsSync(convexConfigPath)
    ? JSON.parse(fs.readFileSync(convexConfigPath, 'utf-8'))
    : {};
  // convex.json "functions" is the path to functions dir, default is "convex"
  const functionsDir = convexConfig.functions || 'convex';
  const functionsDirPath = path.join(process.cwd(), functionsDir);

  // Default: convex/shared/api.ts, or custom outputDir/api.ts
  const outputFile = path.join(
    process.cwd(),
    outputDir || 'convex/shared',
    'api.ts'
  );

  return {
    functionsDir: functionsDirPath,
    outputFile,
  };
}

/** HTTP route definition from _crpcHttpRoute */
type CRPCHttpRoute = {
  path: string;
  method: string;
};

/**
 * Check if a value is a CRPCHttpRouter (has _def.router === true)
 */
function isCRPCHttpRouter(value: unknown): value is {
  _def: {
    router: true;
    procedures: Record<string, { _crpcHttpRoute?: CRPCHttpRoute }>;
  };
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_def' in value &&
    (value as any)._def?.router === true
  );
}

/**
 * Import a module using jiti and extract cRPC metadata from exports.
 */
async function parseModuleRuntime(
  filePath: string,
  jitiInstance: ReturnType<typeof createJiti>
): Promise<{
  meta: ModuleMeta | null;
  httpRoutes: HttpRoutes;
  procedures: ProcedureMeta[];
}> {
  const result: ModuleMeta = {};
  const httpRoutes: HttpRoutes = {};
  const procedures: ProcedureMeta[] = [];
  const isHttp = filePath.endsWith('http.ts');

  // Use jiti to import TypeScript files
  const module = await jitiInstance.import(filePath);

  if (!module || typeof module !== 'object') {
    if (isHttp) {
      console.error('  http.ts: module is empty or not an object');
    }
    return { meta: null, httpRoutes: {}, procedures: [] };
  }

  // Check each export for _crpcMeta, _crpcHttpRoute, or router
  for (const [name, value] of Object.entries(module)) {
    // Skip private exports
    if (name.startsWith('_')) continue;

    // Check if this is a cRPC function with metadata
    const meta = (value as any)?._crpcMeta as CRPCMeta | undefined;

    if (meta?.type) {
      procedures.push({
        exportName: name,
        internal: Boolean(meta.internal),
        type: meta.type,
      });

      // Skip internal functions
      if (meta.internal) continue;

      // Extract relevant metadata
      const fnMeta: FnMeta = { type: meta.type };

      if (meta.auth) {
        fnMeta.auth = meta.auth;
      }

      // Copy any additional meta properties (role, rateLimit, dev, etc.)
      for (const [key, val] of Object.entries(meta)) {
        if (key !== 'type' && key !== 'internal' && val !== undefined) {
          fnMeta[key] = val;
        }
      }

      result[name] = fnMeta;
    }

    // Check if this is an HTTP procedure with route metadata
    const httpRoute = (value as any)?._crpcHttpRoute as
      | CRPCHttpRoute
      | undefined;
    if (httpRoute?.path && httpRoute?.method) {
      httpRoutes[name] = {
        path: httpRoute.path,
        method: httpRoute.method,
      };
    }

    // Check if this is a CRPCHttpRouter with _def.procedures
    if (isCRPCHttpRouter(value)) {
      // Extract routes from router's flat procedures map
      for (const [procPath, procedure] of Object.entries(
        value._def.procedures
      )) {
        const route = procedure._crpcHttpRoute;
        if (route?.path && route?.method) {
          httpRoutes[procPath] = {
            path: route.path,
            method: route.method,
          };
        }
      }
    }
  }

  return {
    meta: Object.keys(result).length > 0 ? result : null,
    httpRoutes,
    procedures,
  };
}

export async function generateMeta(
  outputDir?: string,
  options?: {
    debug?: boolean;
    silent?: boolean;
    scope?: CodegenScope | string;
    api?: boolean;
    auth?: boolean;
  }
): Promise<void> {
  const startTime = Date.now();
  const { functionsDir, outputFile } = getConvexConfig(outputDir);
  const serverOutputFile = getGeneratedServerOutputFile(functionsDir);
  const authOutputFile = getGeneratedAuthOutputFile(functionsDir);
  const migrationsHelperOutputFile =
    getGeneratedMigrationsHelperOutputFile(functionsDir);
  const legacyGeneratedMigrationsOutputFile = path.join(
    functionsDir,
    GENERATED_DIR,
    'migrations.ts'
  );
  const legacyGeneratedMigrationsRuntimeOutputFile = path.join(
    functionsDir,
    GENERATED_DIR,
    'migrations.runtime.ts'
  );
  const legacyGeneratedMigrationsUnderscoreOutputFile = path.join(
    functionsDir,
    GENERATED_DIR,
    '_migrations.ts'
  );
  const generatedAuthModuleName = getModuleNameFromOutputFile(
    authOutputFile,
    functionsDir
  );
  const debug = options?.debug ?? false;
  const silent = options?.silent ?? false;
  const { generateApi, generateAuth, modeLabel } =
    resolveGenerationMode(options);

  if (debug) {
    if (generateApi) {
      console.info('🔍 Scanning Convex functions for cRPC metadata...\n');
    } else {
      console.info(`🔍 Running better-convex codegen (mode=${modeLabel})...\n`);
    }
  }

  const meta: Meta = {};
  const allHttpRoutes: HttpRoutes = {};
  const procedureEntries: ProcedureRegistryEntry[] = [];
  let createdRuntimePlaceholders: string[] = [];
  const runtimeFilesPreservedFromParseFailures = new Set<string>();
  let totalFunctions = 0;
  const authFilePath = path.join(functionsDir, 'auth.ts');
  const hasAuthFile = fs.existsSync(authFilePath);
  const hasAuthDefaultExport = hasDefaultExport(authFilePath);
  const authContract = { hasAuthFile, hasAuthDefaultExport };
  const hasRelationsExport = hasNamedExport(
    path.join(functionsDir, 'schema.ts'),
    'relations'
  );
  const hasTriggersExport = hasNamedExport(
    path.join(functionsDir, 'schema.ts'),
    'triggers'
  );
  const hasMigrationsManifest = fs.existsSync(
    path.join(functionsDir, 'migrations', 'manifest.ts')
  );
  if (hasTriggersExport && !hasRelationsExport) {
    throw new Error(
      "Codegen error: schema.ts exports 'triggers' but is missing 'relations'. Export `relations` and define triggers via `defineTriggers(relations, { ... })`."
    );
  }

  ensureGeneratedSupportPlaceholders(functionsDir, {
    includeAuth: generateAuth,
  });

  if (generateApi) {
    // Signal to createEnv that we are in the CLI's Node.js parse context.
    // Use globalThis instead of process.env so Convex's auth-config env-var
    // scanner never sees this as a required dashboard variable.
    (globalThis as Record<string, unknown>).__BETTER_CONVEX_CODEGEN__ = true;

    try {
      // Create jiti instance for importing TypeScript files
      const jitiInstance = createJiti(process.cwd(), {
        interopDefault: true,
        moduleCache: false,
      });

      const files = listFilesRecursive(functionsDir).filter(
        (file) => file.endsWith('.ts') && isValidConvexFile(file)
      );
      const runtimePlaceholderModules = [
        ...new Set([
          ...files.map((file) => file.replace(TS_EXTENSION_RE, '')),
          ...(hasRelationsExport ? ['generated/server'] : []),
          ...(generateAuth ? [generatedAuthModuleName] : []),
        ]),
      ];
      createdRuntimePlaceholders = ensureGeneratedRuntimePlaceholders(
        functionsDir,
        runtimePlaceholderModules
      );

      for (const file of files) {
        const filePath = path.join(functionsDir, file);
        // Use path (minus .ts) as namespace key: 'items/queries' for nested files
        const moduleName = file.replace(TS_EXTENSION_RE, '');

        try {
          const {
            meta: moduleMeta,
            httpRoutes,
            procedures,
          } = await parseModuleRuntime(filePath, jitiInstance);

          if (moduleMeta) {
            meta[moduleName] = moduleMeta;
            const fnCount = Object.keys(moduleMeta).length;
            totalFunctions += fnCount;
            if (debug) {
              console.info(`  ✓ ${moduleName}: ${fnCount} functions`);
            }
          }

          // Merge HTTP routes
          if (Object.keys(httpRoutes).length > 0 && debug) {
            console.info(
              `  ✓ ${moduleName}: ${Object.keys(httpRoutes).length} HTTP routes`
            );
          }
          Object.assign(allHttpRoutes, httpRoutes);

          for (const procedure of procedures) {
            procedureEntries.push({
              moduleName,
              exportName: procedure.exportName,
              internal: procedure.internal,
              type: procedure.type,
              kind: 'crpc',
            });
          }
        } catch (error) {
          runtimeFilesPreservedFromParseFailures.add(
            getGeneratedRuntimeOutputFile(functionsDir, moduleName)
          );
          // Always log http.ts errors as they contain critical HTTP routes
          if (debug || file === 'http.ts') {
            console.error(`  ⚠ Failed to parse ${file}:`, error);
          }
        }
      }
    } finally {
      // biome-ignore lint/performance/noDelete: globalThis property, not a plain object — delete is correct here
      delete (globalThis as Record<string, unknown>).__BETTER_CONVEX_CODEGEN__;
    }
  }

  if (generateApi) {
    // Dedupe HTTP routes: prefer nested paths (todos.get) over flat (get)
    // by keeping only routes where no other route has same path with longer key
    const routesByPath = new Map<string, { key: string; route: HttpRoute }[]>();
    for (const [key, route] of Object.entries(allHttpRoutes)) {
      const pathKey = `${route.path}:${route.method}`;
      const existing = routesByPath.get(pathKey) || [];
      existing.push({ key, route });
      routesByPath.set(pathKey, existing);
    }

    // Keep only the longest key for each path (nested paths are longer)
    const dedupedRoutes: Record<string, HttpRoute> = {};
    for (const entries of routesByPath.values()) {
      const best = entries.reduce((a, b) =>
        a.key.length >= b.key.length ? a : b
      );
      dedupedRoutes[best.key] = best.route;
    }

    const runtimeApiImportPath = getRuntimeApiImportPath(
      outputFile,
      functionsDir
    );
    const schemaImportPath = getSchemaImportPath(outputFile, functionsDir);
    const httpImportPath = getHttpImportPath(outputFile, functionsDir);
    const hasTablesExport = hasNamedExport(
      path.join(functionsDir, 'schema.ts'),
      'tables'
    );
    const hasHttpRouterExport = hasNamedExport(
      path.join(functionsDir, 'http.ts'),
      'httpRouter'
    );

    const apiTree = createApiTree(meta);
    const hasRootHttpNamespace =
      Object.hasOwn(apiTree.children, 'http') ||
      apiTree.functions.some((entry) => entry.fnName === 'http');
    if (hasRootHttpNamespace) {
      throw new Error(
        'Codegen conflict: root "http" namespace is reserved for generated HTTP router types. Rename your Convex module/function.'
      );
    }
    const apiObjectLines = emitApiObject(
      apiTree,
      [],
      outputFile,
      functionsDir,
      1,
      dedupedRoutes,
      hasHttpRouterExport
    );
    const apiObjectBody =
      apiObjectLines.length > 0 ? `\n${apiObjectLines.join('\n')}\n` : '\n';

    const serverTypeImports =
      'import type { inferApiInputs, inferApiOutputs } from "better-convex/server";';

    const ormTypeImports = [
      hasTablesExport ? 'InferInsertModel' : null,
      hasTablesExport ? 'InferSelectModel' : null,
    ].filter((item): item is string => !!item);

    const optionalImports = [
      ormTypeImports.length > 0
        ? `import type { ${ormTypeImports.join(', ')} } from "better-convex/orm";`
        : null,
      hasHttpRouterExport
        ? `import type { httpRouter } from ${JSON.stringify(httpImportPath)};`
        : null,
      hasTablesExport
        ? `import type { tables } from ${JSON.stringify(schemaImportPath)};`
        : null,
    ]
      .filter((line): line is string => !!line)
      .join('\n');

    const apiTypeLine = 'export type Api = typeof api;';

    const optionalTypeExports = [
      hasTablesExport
        ? `
export type TableName = keyof typeof tables;
export type Select<T extends TableName> = InferSelectModel<(typeof tables)[T]>;
export type Insert<T extends TableName> = InferInsertModel<(typeof tables)[T]>;`
        : null,
    ]
      .filter((entry): entry is string => !!entry)
      .join('\n');

    const output = `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

import { createApiLeaf } from "better-convex/server";
${serverTypeImports}
import { api as convexApi } from ${JSON.stringify(runtimeApiImportPath)};
${optionalImports ? `\n${optionalImports}` : ''}

export const api = {${apiObjectBody}} as const;

${apiTypeLine}
export type ApiInputs = inferApiInputs<Api>;
export type ApiOutputs = inferApiOutputs<Api>;
${optionalTypeExports}
`;

    const outputDirname = path.dirname(outputFile);
    if (!fs.existsSync(outputDirname)) {
      fs.mkdirSync(outputDirname, { recursive: true });
    }
    fs.writeFileSync(outputFile, output);
  } else {
    fs.rmSync(outputFile, { force: true });
  }

  const serverOutput = emitGeneratedServerFile(
    serverOutputFile,
    functionsDir,
    hasRelationsExport,
    hasTriggersExport,
    hasMigrationsManifest
  );

  const generatedOutputDirname = path.dirname(serverOutputFile);
  if (!fs.existsSync(generatedOutputDirname)) {
    fs.mkdirSync(generatedOutputDirname, { recursive: true });
  }

  fs.writeFileSync(serverOutputFile, serverOutput);

  const migrationsOutput = emitGeneratedMigrationsFile(
    migrationsHelperOutputFile,
    functionsDir,
    hasRelationsExport
  );
  fs.writeFileSync(migrationsHelperOutputFile, migrationsOutput);
  fs.rmSync(legacyGeneratedMigrationsOutputFile, { force: true });
  fs.rmSync(legacyGeneratedMigrationsRuntimeOutputFile, { force: true });
  fs.rmSync(legacyGeneratedMigrationsUnderscoreOutputFile, { force: true });

  if (generateAuth) {
    const authOutput = emitGeneratedAuthFile(
      authOutputFile,
      functionsDir,
      hasRelationsExport,
      authContract
    );
    fs.writeFileSync(authOutputFile, authOutput);
  } else {
    fs.rmSync(authOutputFile, { force: true });
  }

  fs.rmSync(getLegacyGeneratedOutputFile(functionsDir), { force: true });

  const mergedProcedureEntries = dedupeProcedureEntries([
    ...(hasRelationsExport
      ? buildGeneratedServerRuntimeProcedureEntries('generated/server')
      : []),
    ...(generateApi ? procedureEntries : []),
    ...(generateAuth && hasAuthDefaultExport
      ? buildAuthRuntimeProcedureEntries(generatedAuthModuleName)
      : []),
  ]);

  const runtimeProcedureEntriesByModule = new Map<
    string,
    ProcedureRegistryEntry[]
  >();

  for (const entry of mergedProcedureEntries) {
    if (RUNTIME_CALLER_RESERVED_EXPORTS.has(entry.exportName)) {
      throw new Error(
        `Codegen conflict: "${entry.moduleName}.${entry.exportName}" uses reserved runtime caller namespace "${entry.exportName}". Rename the procedure export.`
      );
    }
    const existingEntries = runtimeProcedureEntriesByModule.get(
      entry.moduleName
    );
    if (existingEntries) {
      existingEntries.push(entry);
      continue;
    }
    runtimeProcedureEntriesByModule.set(entry.moduleName, [entry]);
  }

  const runtimeOutputFiles: string[] = [];
  for (const [moduleName, moduleEntries] of [
    ...runtimeProcedureEntriesByModule,
  ].sort(([moduleA], [moduleB]) => moduleA.localeCompare(moduleB))) {
    const runtimeOutputFile = getGeneratedRuntimeOutputFile(
      functionsDir,
      moduleName
    );
    const runtimeOutput = emitGeneratedModuleRuntimeFile(
      runtimeOutputFile,
      functionsDir,
      moduleName,
      moduleEntries
    );
    fs.mkdirSync(path.dirname(runtimeOutputFile), { recursive: true });
    fs.writeFileSync(runtimeOutputFile, runtimeOutput);
    runtimeOutputFiles.push(runtimeOutputFile);
  }
  const runtimeOutputFileSet = new Set(runtimeOutputFiles);
  const existingRuntimeFiles = listGeneratedRuntimeFiles(functionsDir);
  for (const existingRuntimeFile of existingRuntimeFiles) {
    if (
      runtimeOutputFileSet.has(existingRuntimeFile) ||
      runtimeFilesPreservedFromParseFailures.has(existingRuntimeFile)
    ) {
      continue;
    }
    fs.rmSync(existingRuntimeFile, { force: true });
  }
  for (const createdRuntimePlaceholder of createdRuntimePlaceholders) {
    if (
      runtimeOutputFileSet.has(createdRuntimePlaceholder) ||
      runtimeFilesPreservedFromParseFailures.has(createdRuntimePlaceholder)
    ) {
      continue;
    }
    fs.rmSync(createdRuntimePlaceholder, { force: true });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const time = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (!silent) {
    if (debug) {
      if (generateApi) {
        console.info(`\n✅ Generated ${outputFile}`);
      } else {
        console.info(`\n🧹 Removed ${outputFile}`);
      }
      console.info(`✅ Generated ${serverOutputFile}`);
      console.info(`✅ Generated ${migrationsHelperOutputFile}`);
      if (generateAuth) {
        console.info(`✅ Generated ${authOutputFile}`);
      } else {
        console.info(`🧹 Removed ${authOutputFile}`);
      }
      for (const runtimeOutputFile of runtimeOutputFiles) {
        console.info(`✅ Generated ${runtimeOutputFile}`);
      }
      if (generateApi) {
        console.info(
          `   ${Object.keys(meta).length} modules, ${totalFunctions} functions`
        );
      } else {
        console.info('   cRPC scan skipped for scoped generation');
      }
    } else {
      console.info(`✔ ${time} Convex api ready! (${elapsed}s)`);
    }
  }
}
