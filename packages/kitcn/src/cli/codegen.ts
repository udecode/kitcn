import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getSchemaRelations, getSchemaTriggers } from '../orm/schema';
import { OrmSchemaOptions } from '../orm/symbols';
import { isValidConvexFile } from '../shared/meta-utils';
import { CRPC_BUILDER_STUB_SOURCE } from './utils/crpc-builder-stub.js';
import { logger } from './utils/logger.js';
import {
  createProjectJiti,
  getProjectServerParserShimPath,
} from './utils/project-jiti.js';

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
const MISSING_KITCN_IMPORT_RE =
  /Cannot find (?:module|package) ['"]kitcn(?:\/[^'"]+)?['"]/;
const RUNTIME_CALLER_RESERVED_EXPORTS = new Set(['actions', 'schedule']);
const DEFAULT_TRIM_SEGMENTS = ['plugins', 'generated'] as const;

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

function resolveGenerationMode(options?: { scope?: CodegenScope | string }): {
  generateApi: boolean;
  generateAuth: boolean;
  modeLabel: string;
} {
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

const GENERATED_ORM_RUNTIME_PROCEDURES: readonly Omit<
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function getRuntimeNameHash(moduleName: string): string {
  return createHash('sha1').update(moduleName).digest('hex').slice(0, 6);
}

function normalizeTrimSegments(trimSegments?: readonly string[]): string[] {
  const source = [...DEFAULT_TRIM_SEGMENTS, ...(trimSegments ?? [])];
  return [...new Set(source.map((segment) => segment.trim()).filter(Boolean))];
}

function toRuntimeExportBase(
  moduleSegments: readonly string[],
  fallbackSegments?: readonly string[]
): string {
  const base = moduleSegments
    .filter((segment) => segment.length > 0)
    .flatMap((segment) =>
      segment
        .split(/[^a-zA-Z0-9]+/g)
        .filter(Boolean)
        .map((token) => toPascalCaseToken(token))
    )
    .join('');

  if (base.length === 0) {
    if (fallbackSegments && fallbackSegments.length > 0) {
      return toRuntimeExportBase(fallbackSegments);
    }
    return 'Module';
  }

  return IDENTIFIER_START_RE.test(base) ? base : `M${base}`;
}

function getModuleRuntimeExportBase(
  moduleName: string,
  trimSegments: readonly string[]
): {
  primaryBase: string;
  collisionBase: string;
} {
  const moduleSegments = moduleName.split('/').filter(Boolean);
  const trimSet = new Set(trimSegments);
  const keptSegments = moduleSegments.filter(
    (segment) => !trimSet.has(segment)
  );
  const removedSegments = moduleSegments.filter((segment) =>
    trimSet.has(segment)
  );
  const primaryBase = toRuntimeExportBase(keptSegments, moduleSegments);
  const removedBase = toRuntimeExportBase(removedSegments);
  return {
    primaryBase,
    collisionBase:
      removedSegments.length > 0 ? `${primaryBase}${removedBase}` : primaryBase,
  };
}

function resolveModuleRuntimeExportNames(
  moduleNames: readonly string[],
  trimSegments: readonly string[]
): Map<
  string,
  {
    callerExportName: string;
    handlerExportName: string;
  }
> {
  const resolvedNames = new Map<
    string,
    {
      callerExportName: string;
      handlerExportName: string;
    }
  >();
  const byPrimaryBase = new Map<
    string,
    Array<{
      moduleName: string;
      collisionBase: string;
    }>
  >();

  for (const moduleName of [...new Set(moduleNames)].sort((a, b) =>
    a.localeCompare(b)
  )) {
    if (moduleName === 'generated/server') {
      resolvedNames.set(moduleName, {
        callerExportName: 'createServerCaller',
        handlerExportName: 'createServerHandler',
      });
      continue;
    }
    const { primaryBase, collisionBase } = getModuleRuntimeExportBase(
      moduleName,
      trimSegments
    );
    const entries = byPrimaryBase.get(primaryBase);
    if (entries) {
      entries.push({ moduleName, collisionBase });
      continue;
    }
    byPrimaryBase.set(primaryBase, [{ moduleName, collisionBase }]);
  }

  for (const [primaryBase, entries] of byPrimaryBase) {
    if (entries.length === 1) {
      const entry = entries[0];
      if (!entry) {
        continue;
      }
      resolvedNames.set(entry.moduleName, {
        callerExportName: `create${primaryBase}Caller`,
        handlerExportName: `create${primaryBase}Handler`,
      });
      continue;
    }

    const usedBases = new Set<string>();
    for (const entry of entries) {
      let exportBase = entry.collisionBase;
      if (usedBases.has(exportBase)) {
        exportBase = `${exportBase}_${getRuntimeNameHash(entry.moduleName)}`;
      }
      usedBases.add(exportBase);
      resolvedNames.set(entry.moduleName, {
        callerExportName: `create${exportBase}Caller`,
        handlerExportName: `create${exportBase}Handler`,
      });
    }
  }

  return resolvedNames;
}

function getModuleRuntimeExportNames(moduleName: string): {
  callerExportName: string;
  handlerExportName: string;
} {
  const base = toRuntimeExportBase(moduleName.split('/').filter(Boolean));
  return {
    callerExportName: `create${base}Caller`,
    handlerExportName: `create${base}Handler`,
  };
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

function getRuntimeApiTypesImportPath(
  outputFile: string,
  functionsDir: string
): string {
  const runtimeApiFile = path.join(functionsDir, '_generated', 'api');
  const relativePath = path.relative(path.dirname(outputFile), runtimeApiFile);
  return ensureRelativeImportPath(normalizeImportPath(relativePath));
}

function moduleUsesOwnGeneratedRuntime(
  functionsDir: string,
  moduleName: string
): boolean {
  if (moduleName === 'generated/server') {
    return true;
  }

  const moduleFilePath = path.join(functionsDir, `${moduleName}.ts`);
  if (!fs.existsSync(moduleFilePath)) {
    return false;
  }

  const source = fs.readFileSync(moduleFilePath, 'utf8');
  const runtimeImportPath = ensureRelativeImportPath(
    normalizeImportPath(
      path.relative(
        path.dirname(moduleFilePath),
        path.join(functionsDir, 'generated', `${moduleName}.runtime`)
      )
    )
  );
  const escapedRuntimeImportPath = escapeRegex(runtimeImportPath);
  return [
    new RegExp(`from\\s+['"]${escapedRuntimeImportPath}(?:\\.[jt]s)?['"]`),
    new RegExp(
      `require\\(\\s*['"]${escapedRuntimeImportPath}(?:\\.[jt]s)?['"]\\s*\\)`
    ),
  ].some((pattern) => pattern.test(source));
}

function getBracketAccessPath(
  rootIdentifier: string,
  pathSegments: readonly string[]
): string {
  return pathSegments.reduce(
    (accessPath, segment) => `${accessPath}[${JSON.stringify(segment)}]`,
    rootIdentifier
  );
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

function getGeneratedOrmOutputFile(functionsDir: string): string {
  return path.join(functionsDir, GENERATED_DIR, 'orm.ts');
}

function getGeneratedCrpcOutputFile(functionsDir: string): string {
  return path.join(functionsDir, GENERATED_DIR, 'crpc.ts');
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
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
// This file is auto-generated by kitcn
// Do not edit manually. Run \`kitcn codegen\` to regenerate.

import type {
  ActionCtx as ServerActionCtx,
  MutationCtx as ServerMutationCtx,
  QueryCtx as ServerQueryCtx,
} from '../_generated/server';

export type QueryCtx = ServerQueryCtx;
export type MutationCtx = ServerMutationCtx;
export type ActionCtx = ServerActionCtx;
export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;

${CRPC_BUILDER_STUB_SOURCE}

export function withOrm<Ctx>(ctx: Ctx): Ctx {
  return ctx;
}
`;
}

function emitGeneratedAuthPlaceholderFile(): string {
  return `// biome-ignore-all format: generated
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
// This file is auto-generated by kitcn
// Do not edit manually. Run \`kitcn codegen\` to regenerate.

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
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
// This file is auto-generated by kitcn
// Do not edit manually. Run \`kitcn codegen\` to regenerate.

export { defineMigration } from 'kitcn/orm';
`;
}

function writeFileIfChanged(filePath: string, content: string) {
  if (fs.existsSync(filePath)) {
    const existingContent = fs.readFileSync(filePath, 'utf8');
    if (existingContent === content) {
      return false;
    }
  }

  fs.writeFileSync(filePath, content);
  return true;
}

function ensureGeneratedSupportPlaceholders(
  functionsDir: string,
  options?: { includeAuth?: boolean }
): string[] {
  const createdPlaceholderFiles: string[] = [];
  const serverOutputFile = getGeneratedServerOutputFile(functionsDir);
  const authOutputFile = getGeneratedAuthOutputFile(functionsDir);
  const migrationsHelperOutputFile =
    getGeneratedMigrationsHelperOutputFile(functionsDir);
  const generatedDir = path.dirname(serverOutputFile);
  fs.mkdirSync(generatedDir, { recursive: true });
  const includeAuth = options?.includeAuth ?? true;

  if (!fs.existsSync(serverOutputFile)) {
    writeFileIfChanged(serverOutputFile, emitGeneratedServerPlaceholderFile());
    createdPlaceholderFiles.push(serverOutputFile);
  }

  if (includeAuth && !fs.existsSync(authOutputFile)) {
    writeFileIfChanged(authOutputFile, emitGeneratedAuthPlaceholderFile());
    createdPlaceholderFiles.push(authOutputFile);
  }

  if (!fs.existsSync(migrationsHelperOutputFile)) {
    writeFileIfChanged(
      migrationsHelperOutputFile,
      emitGeneratedMigrationsPlaceholderFile()
    );
    createdPlaceholderFiles.push(migrationsHelperOutputFile);
  }

  return createdPlaceholderFiles;
}

function emitGeneratedRuntimePlaceholderFile(exportNames: {
  callerExportName: string;
  handlerExportName: string;
}): string {
  const { callerExportName, handlerExportName } = exportNames;
  return `// biome-ignore-all format: generated
// This file is auto-generated by kitcn
// Do not edit manually. Run \`kitcn codegen\` to regenerate.

export function ${callerExportName}(_ctx: unknown) {
  throw new Error('[kitcn] Runtime caller is not generated yet. Run kitcn codegen.');
}

export function ${handlerExportName}(_ctx: unknown) {
  throw new Error('[kitcn] Runtime handler is not generated yet. Run kitcn codegen.');
}
`;
}

function ensureGeneratedRuntimePlaceholders(
  functionsDir: string,
  moduleNames: string[],
  runtimeExportNames: ReadonlyMap<
    string,
    {
      callerExportName: string;
      handlerExportName: string;
    }
  >
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
    const exportNames =
      runtimeExportNames.get(moduleName) ??
      getModuleRuntimeExportNames(moduleName);
    fs.mkdirSync(path.dirname(runtimeOutputFile), { recursive: true });
    writeFileIfChanged(
      runtimeOutputFile,
      emitGeneratedRuntimePlaceholderFile(exportNames)
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

async function resolveSchemaMetadataForCodegen(
  functionsDir: string,
  debug: boolean
): Promise<{
  hasOrmSchema: boolean;
  hasRelations: boolean;
  hasTriggers: boolean;
}> {
  const schemaPath = path.join(functionsDir, 'schema.ts');
  if (!fs.existsSync(schemaPath)) {
    return {
      hasOrmSchema: false,
      hasRelations: false,
      hasTriggers: false,
    };
  }

  const jitiInstance = createProjectJiti();

  try {
    const schemaModule = await jitiInstance.import(schemaPath);
    const schemaValue =
      schemaModule && typeof schemaModule === 'object'
        ? ((schemaModule as Record<string, unknown>).default ?? schemaModule)
        : null;

    if (!schemaValue || typeof schemaValue !== 'object') {
      return {
        hasOrmSchema: false,
        hasRelations: false,
        hasTriggers: false,
      };
    }

    const hasOrmSchema = OrmSchemaOptions in schemaValue;
    const hasRelations = Boolean(getSchemaRelations(schemaValue));
    const hasTriggers = Boolean(getSchemaTriggers(schemaValue));

    return {
      hasOrmSchema,
      hasRelations,
      hasTriggers,
    };
  } catch (error) {
    if (debug) {
      logger.warn(
        `⚠️  Failed to load schema extensions from ${schemaPath}: ${(error as Error).message}`
      );
    }
    return {
      hasOrmSchema: false,
      hasRelations: false,
      hasTriggers: false,
    };
  }
}

function cleanupGeneratedPluginArtifacts(functionsDir: string): void {
  fs.rmSync(path.join(functionsDir, GENERATED_DIR, 'plugins'), {
    recursive: true,
    force: true,
  });
}

type GeneratedAuthContract = {
  hasAuthFile: boolean;
  hasAuthDefaultExport: boolean;
};

function emitGeneratedServerFile(
  outputFile: string,
  functionsDir: string,
  hasOrmSchema: boolean,
  hasMigrationsManifest: boolean
): string {
  const asSingleQuotedImport = (importPath: string) =>
    `'${importPath.replaceAll("'", "\\'")}'`;
  const serverTypesImportPath = getServerTypesImportPath(
    outputFile,
    functionsDir
  );
  const dataModelImportPath = getDataModelImportPath(outputFile, functionsDir);
  const schemaImportPath = getSchemaImportPath(outputFile, functionsDir);
  const migrationsManifestImportPath = getModuleImportPath(
    outputFile,
    functionsDir,
    'migrations/manifest'
  );
  const serverTypesImportLiteral = asSingleQuotedImport(serverTypesImportPath);
  const dataModelImportLiteral = asSingleQuotedImport(dataModelImportPath);
  const schemaImportLiteral = asSingleQuotedImport(schemaImportPath);
  const migrationsManifestImportLiteral = asSingleQuotedImport(
    migrationsManifestImportPath
  );
  const migrationsImportLine = hasMigrationsManifest
    ? `import { migrations } from ${migrationsManifestImportLiteral};\n`
    : '';
  const migrationsConfigLine = hasMigrationsManifest ? '  migrations,\n' : '';

  if (!hasOrmSchema) {
    return `// biome-ignore-all format: generated
// This file is auto-generated by kitcn
// Do not edit manually. Run \`kitcn codegen\` to regenerate.

import { initCRPC as baseInitCRPC } from 'kitcn/server';
import type { DataModel } from ${dataModelImportLiteral};
import type {
  ActionCtx as ServerActionCtx,
  MutationCtx as ServerMutationCtx,
  QueryCtx as ServerQueryCtx,
} from ${serverTypesImportLiteral};
import { httpAction, internalMutation } from ${serverTypesImportLiteral};

export type QueryCtx = ServerQueryCtx;
export type MutationCtx = ServerMutationCtx;
export type ActionCtx = ServerActionCtx;
export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;
export type OrmCtx<Ctx = QueryCtx> = Ctx;

export function withOrm<Ctx extends ServerQueryCtx | ServerMutationCtx>(ctx: Ctx): OrmCtx<Ctx> {
  return ctx as OrmCtx<Ctx>;
}

export const initCRPC = baseInitCRPC.dataModel<DataModel>().context({
  query: (ctx) => ctx,
  mutation: (ctx) => ctx,
  action: (ctx) => ctx,
});
export { httpAction, internalMutation };
`;
  }

  const moduleNamespace = getModuleNameFromOutputFile(outputFile, functionsDir);
  const ormFunctionsDeclaration = `const ormFunctions: OrmFunctions = {
  scheduledMutationBatch: createGeneratedFunctionReference<"mutation", "internal", unknown>(${JSON.stringify(
    `${moduleNamespace}:scheduledMutationBatch`
  )}),
  scheduledDelete: createGeneratedFunctionReference<"mutation", "internal", unknown>(${JSON.stringify(
    `${moduleNamespace}:scheduledDelete`
  )}),
  aggregateBackfillChunk: createGeneratedFunctionReference<"mutation", "internal", unknown>(${JSON.stringify(
    `${moduleNamespace}:aggregateBackfillChunk`
  )}),
  migrationRunChunk: createGeneratedFunctionReference<"mutation", "internal", unknown>(${JSON.stringify(
    `${moduleNamespace}:migrationRunChunk`
  )}),
  resetChunk: createGeneratedFunctionReference<"mutation", "internal", unknown>(${JSON.stringify(
    `${moduleNamespace}:resetChunk`
  )}),
};`;
  const ormSchemaDeclaration = 'const ormSchema = schema;';

  return `// biome-ignore-all format: generated
// This file is auto-generated by kitcn
// Do not edit manually. Run \`kitcn codegen\` to regenerate.

import {
  createOrm,
  type GenericOrmCtx,
  type OrmFunctions,
} from 'kitcn/orm';
import {
  createGeneratedFunctionReference,
  initCRPC as baseInitCRPC,
} from 'kitcn/server';
import type { DataModel } from ${dataModelImportLiteral};
import type {
  ActionCtx as ServerActionCtx,
  MutationCtx as ServerMutationCtx,
  QueryCtx as ServerQueryCtx,
} from ${serverTypesImportLiteral};
import { httpAction, internalMutation } from ${serverTypesImportLiteral};
import schema from ${schemaImportLiteral};
${migrationsImportLine}

${ormFunctionsDeclaration}
${ormSchemaDeclaration}

export const orm = createOrm({
  schema: ormSchema,
  ormFunctions,
${migrationsConfigLine}  internalMutation,
});

export type OrmCtx<Ctx extends ServerQueryCtx | ServerMutationCtx = ServerQueryCtx> = GenericOrmCtx<Ctx, typeof ormSchema>;
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
  action: (ctx) => ctx,
});
export { httpAction, internalMutation };

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
  hasOrmSchema: boolean,
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
  const authDefinitionFilePath = normalizeImportPath(
    path.relative(process.cwd(), path.join(functionsDir, 'auth.ts'))
  );
  const hasAuthFile = authContract.hasAuthFile;
  const hasAuthDefaultExport = authContract.hasAuthDefaultExport;
  const authRuntimeModule = hasAuthDefaultExport
    ? 'kitcn/auth'
    : 'kitcn/auth/generated';
  const disabledAuthReasonKind = hasAuthFile
    ? hasAuthDefaultExport
      ? 'default_export_unavailable'
      : 'missing_default_export'
    : 'missing_auth_file';
  const authRuntimeImportSpecifiers = hasAuthDefaultExport
    ? [
        'type BetterAuthOptionsWithoutDatabase',
        'type AuthRuntime',
        'defineAuth as baseDefineAuth',
        'createAuthRuntime',
        'type GenericAuthDefinition',
        'getInvalidAuthDefinitionExportReason',
        'resolveGeneratedAuthDefinition',
      ]
    : [
        'type BetterAuthOptionsWithoutDatabase',
        'type AuthRuntime',
        'defineAuth as baseDefineAuth',
        'type GenericAuthDefinition',
        'getGeneratedAuthDisabledReason',
        'createDisabledAuthRuntime',
      ];
  const authRuntimeImports = `import {
  ${authRuntimeImportSpecifiers.join(',\n  ')},
} from '${authRuntimeModule}';`;
  const authDefinitionImport = hasAuthDefaultExport
    ? `import * as authDefinitionModule from ${authDefinitionImportLiteral};`
    : '';
  const runtimeApiImport = hasAuthDefaultExport
    ? `import { internal } from ${runtimeApiImportLiteral};`
    : '';
  const withOrmImport =
    hasOrmSchema && hasAuthDefaultExport
      ? `import { withOrm } from ${serverImportLiteral};`
      : '';
  const usesSchemaFallback = !hasOrmSchema && !hasAuthDefaultExport;
  const schemaTypeImports = usesSchemaFallback
    ? `import type { GenericSchema, SchemaDefinition } from 'convex/server';`
    : '';
  const generatedSchemaType = usesSchemaFallback
    ? 'GeneratedSchema'
    : 'typeof schema';
  const schemaImport = usesSchemaFallback
    ? ''
    : `import schema from ${schemaImportLiteral};`;

  return `// biome-ignore-all format: generated
// This file is auto-generated by kitcn
// Do not edit manually. Run \`kitcn codegen\` to regenerate.

${authRuntimeImports}
${runtimeApiImport}
import type { DataModel } from ${dataModelImportLiteral};
import type { GenericCtx, MutationCtx } from ${serverImportLiteral};
${schemaTypeImports}
${withOrmImport}
${schemaImport}
${authDefinitionImport}

${usesSchemaFallback ? 'type GeneratedSchema = SchemaDefinition<GenericSchema, true>;' : ''}

export function defineAuth<
  AuthOptions extends BetterAuthOptionsWithoutDatabase = BetterAuthOptionsWithoutDatabase,
>(
  definition: GenericAuthDefinition<GenericCtx, DataModel, ${generatedSchemaType}, AuthOptions>
) {
  return baseDefineAuth(definition);
}

${
  hasAuthDefaultExport
    ? `type AuthDefinitionFromFile = typeof authDefinitionModule.default;

const authDefinition = resolveGeneratedAuthDefinition<AuthDefinitionFromFile>(
  authDefinitionModule,
  getInvalidAuthDefinitionExportReason(${JSON.stringify(authDefinitionFilePath)})
);
`
    : ''
}
const authRuntime: ${
    hasAuthDefaultExport
      ? `AuthRuntime<
  DataModel,
  ${generatedSchemaType},
  MutationCtx,
  GenericCtx,
  ReturnType<AuthDefinitionFromFile>
> = createAuthRuntime<
  DataModel,
  ${generatedSchemaType},
  MutationCtx,
  GenericCtx,
  ReturnType<AuthDefinitionFromFile>
>({
  internal,
  moduleName: ${JSON.stringify(moduleNamespace)},
  schema,
  auth: authDefinition,${hasOrmSchema ? '\n  context: withOrm,' : ''}
})`
      : `AuthRuntime<
  DataModel,
  ${generatedSchemaType},
  MutationCtx,
  GenericCtx
> = createDisabledAuthRuntime<DataModel, ${generatedSchemaType}, MutationCtx, GenericCtx>({
  reason: getGeneratedAuthDisabledReason(
    ${JSON.stringify(disabledAuthReasonKind)},
    ${JSON.stringify(authDefinitionFilePath)}
  ),
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
  hasRelationsMetadata: boolean
): string {
  if (!hasRelationsMetadata) {
    return emitGeneratedMigrationsPlaceholderFile();
  }

  const asSingleQuotedImport = (importPath: string) =>
    `'${importPath.replaceAll("'", "\\'")}'`;
  const schemaImportPath = getSchemaImportPath(outputFile, functionsDir);
  const schemaImportLiteral = asSingleQuotedImport(schemaImportPath);
  const migrationSchemaImport = 'schema';
  const migrationSchemaType = 'typeof schema';

  return `// biome-ignore-all format: generated
// This file is auto-generated by kitcn
// Do not edit manually. Run \`kitcn codegen\` to regenerate.

import {
  defineMigration as baseDefineMigration,
  type MigrationDefinition,
} from 'kitcn/orm';
import ${migrationSchemaImport} from ${schemaImportLiteral};

export function defineMigration(
  migration: MigrationDefinition<${migrationSchemaType}>
): MigrationDefinition<${migrationSchemaType}> {
  return baseDefineMigration<${migrationSchemaType}>(migration);
}
`;
}

function emitGeneratedModuleRuntimeFile(
  outputFile: string,
  functionsDir: string,
  moduleName: string,
  procedureEntries: ProcedureRegistryEntry[],
  runtimeExportNames?: ReadonlyMap<
    string,
    {
      callerExportName: string;
      handlerExportName: string;
    }
  >
): string {
  const { callerExportName, handlerExportName } =
    runtimeExportNames?.get(moduleName) ??
    getModuleRuntimeExportNames(moduleName);
  const useGeneratedApiTypes = moduleUsesOwnGeneratedRuntime(
    functionsDir,
    moduleName
  );
  const runtimeApiTypesImportPath = useGeneratedApiTypes
    ? getRuntimeApiTypesImportPath(outputFile, functionsDir)
    : null;
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
    moduleName,
    useGeneratedApiTypes
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
        moduleName,
        useGeneratedApiTypes
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
> = GeneratedRegistryHandlerForContext<
  ProcedureHandlerRegistry,
  TCtx,
  QueryCtx,
  MutationCtx
>;
`
    : '';
  const generatedRuntimeTypeArgs = hasHandlerRegistry
    ? `
  QueryCtx,
  MutationCtx,
  ProcedureCallerRegistry,
  ActionCtx,
  ProcedureHandlerRegistry
`
    : `
  QueryCtx,
  MutationCtx,
  ProcedureCallerRegistry,
  ActionCtx
`;
  const handlerExport = hasHandlerRegistry
    ? `
export function ${handlerExportName}<TCtx extends ProcedureHandlerContext>(
  ctx: TCtx
): GeneratedProcedureHandler<TCtx> {
  return generatedRuntime.getHandlerFactory()(ctx) as GeneratedProcedureHandler<TCtx>;
}
`
    : '';

  return `// biome-ignore-all format: generated
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
// This file is auto-generated by kitcn
// Do not edit manually. Run \`kitcn codegen\` to regenerate.

import {
  createGeneratedFunctionReference,
  createGeneratedRegistryRuntime,
  typedProcedureResolver,
  type GeneratedRegistryCallerForContext,${
    hasHandlerRegistry ? '\n  type GeneratedRegistryHandlerForContext,' : ''
  }
} from 'kitcn/server';
${
  runtimeApiTypesImportPath
    ? `import type {
  api as generatedApi,
  internal as generatedInternal,
} from '${runtimeApiTypesImportPath}';
`
    : ''
}import type { ActionCtx, MutationCtx, QueryCtx } from '${generatedServerImportPath}';
import type { OrmTriggerContext } from 'kitcn/orm';

const procedureRegistry = {${callerRegistryBody}} as const;
${handlerRegistryDeclaration}
type ProcedureCallerRegistry = typeof procedureRegistry;
${
  hasHandlerRegistry
    ? `type ProcedureHandlerRegistry = typeof handlerRegistry;
`
    : ''
}

const generatedRuntime = createGeneratedRegistryRuntime<${generatedRuntimeTypeArgs}>({
  procedureRegistry,${hasHandlerRegistry ? '\n  handlerRegistry,' : ''}
});

type MutationCallerContext = MutationCtx | OrmTriggerContext<any, MutationCtx>;
type ProcedureCallerContext = QueryCtx | MutationCallerContext | ActionCtx;
type GeneratedProcedureCaller<
  TCtx extends ProcedureCallerContext = ProcedureCallerContext,
> = GeneratedRegistryCallerForContext<
  ProcedureCallerRegistry,
  TCtx,
  QueryCtx,
  MutationCallerContext,
  ActionCtx
>;
${handlerTypeDeclarations}

export function ${callerExportName}<TCtx extends ProcedureCallerContext>(
  ctx: TCtx
): GeneratedProcedureCaller<TCtx> {
  return generatedRuntime.getCallerFactory()(
    ctx as any
  ) as GeneratedProcedureCaller<TCtx>;
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

    const moduleImportPath = getModuleImportPath(
      outputFile,
      functionsDir,
      fnEntry.moduleName
    );
    const fnMetaLiteral = emitFnMetaLiteral(fnEntry.fnMeta);
    const functionRef = `createGeneratedFunctionReference<${JSON.stringify(
      fnEntry.fnType
    )}, "public", typeof import(${JSON.stringify(moduleImportPath)}).${key}>(${JSON.stringify(
      getGeneratedFunctionName(fnEntry.moduleName, key)
    )})`;

    lines.push(
      `${indent}${formatKey(key)}: createApiLeaf<${JSON.stringify(fnEntry.fnType)}, typeof import(${JSON.stringify(moduleImportPath)}).${key}>(${functionRef}, ${fnMetaLiteral}),`
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
  moduleName: string,
  useGeneratedApiTypes: boolean
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
      const functionRefTypeAccess = useGeneratedApiTypes
        ? getBracketAccessPath(
            entry.internal ? 'generatedInternal' : 'generatedApi',
            entry.exportName === 'default'
              ? entry.moduleName.split('/')
              : [...entry.moduleName.split('/'), entry.exportName]
          )
        : `import(${JSON.stringify(moduleImportPath)}).${entry.exportName}`;
      const functionRefAccess = `createGeneratedFunctionReference<${JSON.stringify(
        entry.type
      )}, ${JSON.stringify(entry.internal ? 'internal' : 'public')}, typeof ${functionRefTypeAccess}>(${JSON.stringify(
        getGeneratedFunctionName(entry.moduleName, entry.exportName)
      )})`;
      const resolver = `(require(${JSON.stringify(moduleImportPath)}) as Record<string, unknown>)[${JSON.stringify(entry.exportName)}]`;
      return `  ${JSON.stringify(pathKey)}: [${JSON.stringify(entry.type)}, typedProcedureResolver(${functionRefAccess}, () => ${resolver})],`;
    })
    .sort((a, b) => a.localeCompare(b));
}

function getGeneratedFunctionName(
  moduleName: string,
  exportName: string
): string {
  return exportName === 'default' ? moduleName : `${moduleName}:${exportName}`;
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

function buildGeneratedOrmRuntimeProcedureEntries(
  moduleName: string
): ProcedureRegistryEntry[] {
  return GENERATED_ORM_RUNTIME_PROCEDURES.map((entry) => ({
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

function shouldSuppressHttpParseWarning(error: unknown): boolean {
  return MISSING_KITCN_IMPORT_RE.test(String(error));
}

export function getConvexConfig(sharedDir?: string): {
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

  // Default: convex/shared/api.ts, or custom sharedDir/api.ts
  const outputFile = path.join(
    process.cwd(),
    sharedDir || 'convex/shared',
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
  jitiInstance: ReturnType<typeof createProjectJiti>
): Promise<{
  meta: ModuleMeta | null;
  httpRoutes: HttpRoutes;
  procedures: ProcedureMeta[];
}> {
  const source = fs.readFileSync(filePath, 'utf8');
  const rewrittenSource = source.replaceAll(
    /from\s+(['"])kitcn\/server\1/g,
    `from ${JSON.stringify(
      normalizeImportPath(getProjectServerParserShimPath())
    )}`
  );
  const importPath =
    rewrittenSource === source
      ? filePath
      : (() => {
          const tempFilePath = `${filePath}.kitcn-parse.ts`;
          fs.writeFileSync(tempFilePath, rewrittenSource, 'utf8');
          return tempFilePath;
        })();
  const result: ModuleMeta = {};
  const httpRoutes: HttpRoutes = {};
  const procedures: ProcedureMeta[] = [];
  const isHttp = filePath.endsWith('http.ts');

  // Use jiti to import TypeScript files
  const module = await jitiInstance.import(importPath);

  if (!module || typeof module !== 'object') {
    if (isHttp) {
      logger.error('  http.ts: module is empty or not an object');
    }
    if (importPath !== filePath) {
      fs.rmSync(importPath, { force: true });
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

      // Copy any additional meta properties (role, ratelimit, dev, etc.)
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

  if (importPath !== filePath) {
    fs.rmSync(importPath, { force: true });
  }

  return {
    meta: Object.keys(result).length > 0 ? result : null,
    httpRoutes,
    procedures,
  };
}

export async function generateMeta(
  sharedDir?: string,
  options?: {
    debug?: boolean;
    silent?: boolean;
    scope?: CodegenScope | string;
    trimSegments?: string[];
  }
): Promise<void> {
  const startTime = Date.now();
  const { functionsDir, outputFile } = getConvexConfig(sharedDir);
  const serverOutputFile = getGeneratedServerOutputFile(functionsDir);
  const ormOutputFile = getGeneratedOrmOutputFile(functionsDir);
  const crpcOutputFile = getGeneratedCrpcOutputFile(functionsDir);
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
  const normalizedTrimSegments = normalizeTrimSegments(options?.trimSegments);

  if (debug) {
    if (generateApi) {
      logger.info('Scanning Convex functions for cRPC metadata...\n');
    } else {
      logger.info(`Running kitcn codegen (mode=${modeLabel})...\n`);
    }
  }

  const meta: Meta = {};
  const allHttpRoutes: HttpRoutes = {};
  const procedureEntries: ProcedureRegistryEntry[] = [];
  const fatalParseFailures: Array<{ file: string; error: unknown }> = [];
  let createdRuntimePlaceholders: string[] = [];
  let createdSupportPlaceholders: string[] = [];
  const runtimeFilesPreservedFromParseFailures = new Set<string>();
  let totalFunctions = 0;
  const authFilePath = path.join(functionsDir, 'auth.ts');
  const hasAuthFile = fs.existsSync(authFilePath);
  const hasAuthDefaultExport = hasDefaultExport(authFilePath);
  const authContract = { hasAuthFile, hasAuthDefaultExport };
  const schemaMetadata = await resolveSchemaMetadataForCodegen(
    functionsDir,
    debug
  );
  const hasOrmSchemaMetadata = schemaMetadata.hasOrmSchema;
  const hasRelationsMetadata = schemaMetadata.hasRelations;
  const hasRelationsExport = hasNamedExport(
    path.join(functionsDir, 'schema.ts'),
    'relations'
  );
  const hasSchemaTriggersExport = hasNamedExport(
    path.join(functionsDir, 'schema.ts'),
    'triggers'
  );
  const hasDedicatedTriggersExport = hasNamedExport(
    path.join(functionsDir, 'triggers.ts'),
    'triggers'
  );
  const hasMigrationsManifest = fs.existsSync(
    path.join(functionsDir, 'migrations', 'manifest.ts')
  );
  if (hasRelationsExport) {
    throw new Error(
      'Codegen error: do not export `relations` from schema.ts. Chain relations on the default schema export with `defineSchema(...).relations(...)`.'
    );
  }
  if (hasSchemaTriggersExport || hasDedicatedTriggersExport) {
    throw new Error(
      'Codegen error: do not export `triggers` from schema.ts or triggers.ts. Chain triggers on the default schema export with `defineSchema(...).relations(...).triggers(...)`.'
    );
  }
  const hasOrmSchema = hasOrmSchemaMetadata;

  createdSupportPlaceholders = ensureGeneratedSupportPlaceholders(
    functionsDir,
    {
      includeAuth: generateAuth,
    }
  );

  if (generateApi) {
    // Signal to createEnv that we are in the CLI's Node.js parse context.
    // Use globalThis instead of process.env so Convex's auth-config env-var
    // scanner never sees this as a required dashboard variable.
    (globalThis as Record<string, unknown>).__KITCN_CODEGEN__ = true;

    try {
      // Create jiti instance for importing TypeScript files
      const jitiInstance = createProjectJiti();

      const files = listFilesRecursive(functionsDir).filter(
        (file) => file.endsWith('.ts') && isValidConvexFile(file)
      );
      const existingRuntimeFilesBeforeParse = new Set(
        listGeneratedRuntimeFiles(functionsDir)
      );
      const runtimePlaceholderModules = [
        ...new Set([
          ...files.map((file) => file.replace(TS_EXTENSION_RE, '')),
          ...(hasOrmSchema ? ['generated/server'] : []),
          ...(generateAuth ? [generatedAuthModuleName] : []),
        ]),
      ];
      const placeholderRuntimeExportNames = resolveModuleRuntimeExportNames(
        runtimePlaceholderModules,
        normalizedTrimSegments
      );
      createdRuntimePlaceholders = ensureGeneratedRuntimePlaceholders(
        functionsDir,
        runtimePlaceholderModules,
        placeholderRuntimeExportNames
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
              logger.info(`  ✓ ${moduleName}: ${fnCount} functions`);
            }
          }

          // Merge HTTP routes
          if (Object.keys(httpRoutes).length > 0 && debug) {
            logger.info(
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
          const runtimeFile = getGeneratedRuntimeOutputFile(
            functionsDir,
            moduleName
          );
          if (existingRuntimeFilesBeforeParse.has(runtimeFile)) {
            runtimeFilesPreservedFromParseFailures.add(runtimeFile);
          }
          const shouldLogParseFailure =
            debug ||
            (file === 'http.ts' && !shouldSuppressHttpParseWarning(error));
          const shouldTreatParseFailureAsFatal = !(
            file === 'http.ts' && shouldSuppressHttpParseWarning(error)
          );
          if (shouldLogParseFailure) {
            logger.error(`  ⚠ Failed to parse ${file}:`, error);
          }
          if (shouldTreatParseFailureAsFatal) {
            fatalParseFailures.push({ file, error });
          }
        }
      }
    } finally {
      // biome-ignore lint/performance/noDelete: globalThis property, not a plain object — delete is correct here
      delete (globalThis as Record<string, unknown>).__KITCN_CODEGEN__;
    }
  }

  if (fatalParseFailures.length > 0) {
    for (const createdRuntimePlaceholder of createdRuntimePlaceholders) {
      fs.rmSync(createdRuntimePlaceholder, { force: true });
    }
    for (const createdSupportPlaceholder of createdSupportPlaceholders) {
      fs.rmSync(createdSupportPlaceholder, { force: true });
    }

    const failureSummary = fatalParseFailures
      .map(
        ({ file, error }) =>
          `- ${file}: ${error instanceof Error ? error.message : String(error)}`
      )
      .join('\n');
    throw new Error(
      `kitcn codegen aborted because module parsing failed:\n${failureSummary}`
    );
  }

  cleanupGeneratedPluginArtifacts(functionsDir);

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

    const schemaImportPath = getSchemaImportPath(outputFile, functionsDir);
    const httpImportPath = getHttpImportPath(outputFile, functionsDir);
    const schemaFilePath = path.join(functionsDir, 'schema.ts');
    const hasTablesExport = hasNamedExport(schemaFilePath, 'tables');
    const needsInferSelectModelImport = hasTablesExport;
    const needsInferInsertModelImport = hasTablesExport;
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
      'import type { inferApiInputs, inferApiOutputs } from "kitcn/server";';

    const ormTypeImports = [
      needsInferInsertModelImport ? 'InferInsertModel' : null,
      needsInferSelectModelImport ? 'InferSelectModel' : null,
    ].filter((item): item is string => !!item);

    const optionalImports = [
      ormTypeImports.length > 0
        ? `import type { ${ormTypeImports.join(', ')} } from "kitcn/orm";`
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
// This file is auto-generated by kitcn
// Do not edit manually. Run \`kitcn codegen\` to regenerate.

import { createApiLeaf, createGeneratedFunctionReference } from "kitcn/server";
${serverTypeImports}
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
    writeFileIfChanged(outputFile, output);
  } else {
    fs.rmSync(outputFile, { force: true });
  }

  const serverOutput = emitGeneratedServerFile(
    serverOutputFile,
    functionsDir,
    hasOrmSchema,
    hasMigrationsManifest
  );

  const generatedOutputDirname = path.dirname(serverOutputFile);
  if (!fs.existsSync(generatedOutputDirname)) {
    fs.mkdirSync(generatedOutputDirname, { recursive: true });
  }

  writeFileIfChanged(serverOutputFile, serverOutput);
  fs.rmSync(ormOutputFile, { force: true });
  fs.rmSync(crpcOutputFile, { force: true });

  const migrationsOutput = emitGeneratedMigrationsFile(
    migrationsHelperOutputFile,
    functionsDir,
    hasRelationsMetadata
  );
  writeFileIfChanged(migrationsHelperOutputFile, migrationsOutput);
  fs.rmSync(legacyGeneratedMigrationsOutputFile, { force: true });
  fs.rmSync(legacyGeneratedMigrationsRuntimeOutputFile, { force: true });
  fs.rmSync(legacyGeneratedMigrationsUnderscoreOutputFile, { force: true });

  if (generateAuth) {
    const authOutput = emitGeneratedAuthFile(
      authOutputFile,
      functionsDir,
      hasOrmSchema,
      authContract
    );
    writeFileIfChanged(authOutputFile, authOutput);
  } else {
    fs.rmSync(authOutputFile, { force: true });
  }

  fs.rmSync(getLegacyGeneratedOutputFile(functionsDir), { force: true });

  const mergedProcedureEntries = dedupeProcedureEntries([
    ...(hasOrmSchema
      ? buildGeneratedOrmRuntimeProcedureEntries('generated/server')
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
  const runtimeExportNames = resolveModuleRuntimeExportNames(
    [...runtimeProcedureEntriesByModule.keys()],
    normalizedTrimSegments
  );
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
      moduleEntries,
      runtimeExportNames
    );
    fs.mkdirSync(path.dirname(runtimeOutputFile), { recursive: true });
    writeFileIfChanged(runtimeOutputFile, runtimeOutput);
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
        logger.success(`\nGenerated ${outputFile}`);
      } else {
        logger.info(`\nRemoved ${outputFile}`);
      }
      logger.success(`Generated ${serverOutputFile}`);
      logger.success(`Generated ${migrationsHelperOutputFile}`);
      if (generateAuth) {
        logger.success(`Generated ${authOutputFile}`);
      } else {
        logger.info(`Removed ${authOutputFile}`);
      }
      for (const runtimeOutputFile of runtimeOutputFiles) {
        logger.success(`Generated ${runtimeOutputFile}`);
      }
      if (generateApi) {
        logger.info(
          `   ${Object.keys(meta).length} modules, ${totalFunctions} functions`
        );
      } else {
        logger.info('   cRPC scan skipped for scoped generation');
      }
    } else {
      logger.success(`${time} Convex api ready! (${elapsed}s)`);
    }
  }
}
