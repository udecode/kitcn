import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Jiti, JitiOptions, ModuleCache } from 'jiti';
import { CRPC_BUILDER_STUB_SOURCE } from './crpc-builder-stub.js';
import { loadBabelParser, loadJiti } from './lazy-deps.js';

const require = createRequire(import.meta.url);

type TypeScriptModule = {
  findConfigFile: (
    searchPath: string,
    fileExists: (fileName: string) => boolean,
    configName: string
  ) => string | undefined;
  parseJsonConfigFileContent: (
    json: unknown,
    host: {
      readDirectory: (...args: any[]) => string[];
      fileExists: (path: string) => boolean;
      readFile: (path: string) => string | undefined;
      useCaseSensitiveFileNames: boolean;
      trace?: (s: string) => void;
      onUnRecoverableConfigFileDiagnostic?: (diagnostic: unknown) => void;
    },
    basePath: string
  ) => {
    options: {
      baseUrl?: string;
      paths?: Record<string, string[]>;
    };
  };
  readConfigFile: (
    fileName: string,
    readFile: (path: string) => string | undefined
  ) => {
    config: unknown;
    error?: unknown;
  };
  sys: {
    directoryExists: (path: string) => boolean;
    fileExists: (path: string) => boolean;
    readFile: (path: string) => string | undefined;
    readDirectory: (...args: any[]) => string[];
    realpath?: (path: string) => string;
    useCaseSensitiveFileNames: boolean;
  };
  ModuleKind: { CommonJS: number; NodeNext: number };
  ModuleResolutionKind: { NodeNext: number };
  createModuleResolutionCache: (
    currentDirectory: string,
    getCanonicalFileName: (fileName: string) => string,
    options: object
  ) => unknown;
  resolveModuleName: (
    moduleName: string,
    containingFile: string,
    options: object,
    host: object,
    cache?: unknown,
    redirectedReference?: undefined,
    resolutionMode?: number
  ) => { resolvedModule?: { resolvedFileName: string } };
};

type JitiExportTarget =
  | string
  | { [key: string]: JitiExportTarget }
  | JitiExportTarget[];

const JITI_EXPORT_CONDITION_PRIORITY = [
  'bun',
  'import',
  'module',
  'default',
  'require',
] as const;

const SERVER_PARSER_SHIM_SOURCE = `${CRPC_BUILDER_STUB_SOURCE}

export class CRPCError extends Error {
  constructor(options = {}) {
    super(options.message ?? options.code ?? "CRPC error");
    this.code = options.code;
  }
}

const parseEnvForCodegen = (schema) => {
  if (typeof schema?.safeParse !== "function") {
    return schema.parse(process.env);
  }

  const result = schema.safeParse(process.env);
  if (result?.success === true) return result.data;

  const issues = result?.error?.issues;
  if (!Array.isArray(issues) || issues.length === 0) {
    return schema.parse(process.env);
  }

  const missingFieldIssues = new Map();
  for (const [key, field] of Object.entries(schema.shape)) {
    if (
      process.env[key] !== undefined ||
      typeof field?.safeParse !== "function"
    ) {
      continue;
    }
    const fieldResult = field.safeParse(undefined);
    if (
      fieldResult?.success === false &&
      Array.isArray(fieldResult.error?.issues)
    ) {
      missingFieldIssues.set(key, fieldResult.error.issues);
    }
  }

  const isMissingFieldIssue = (issue) => {
    if (!Array.isArray(issue?.path) || issue.path.length === 0) return false;
    const [key, ...path] = issue.path;
    const fieldIssues = missingFieldIssues.get(key);
    return fieldIssues?.some(
      (fieldIssue) =>
        fieldIssue?.code === issue.code &&
        JSON.stringify(fieldIssue.path ?? []) === JSON.stringify(path)
    );
  };
  if (!issues.every(isMissingFieldIssue)) {
    return schema.parse(process.env);
  }

  const data = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    if (typeof field?.safeParse !== "function") {
      return schema.parse(process.env);
    }
    const fieldResult = field.safeParse(process.env[key]);
    if (fieldResult?.success === true) {
      data[key] = fieldResult.data;
    } else if (!missingFieldIssues.has(key)) {
      return schema.parse(process.env);
    }
  }
  return data;
};

export const createEnv = ({ schema }) => () => {
  if (typeof schema?.parse !== "function") return process.env;
  if (globalThis.__KITCN_CODEGEN__ !== true || !schema.shape) {
    return schema.parse(process.env);
  }
  return parseEnvForCodegen(schema);
};
export const createHttpRouter = (_app, httpRouter) => httpRouter ?? {};
export const createCallerFactory = () => () => ({});
export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
  const meta = maybeMeta ?? pathOrMeta;
  const fn = Array.isArray(pathOrMeta)
    ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
    : fnOrRoot;
  return Object.assign(fn ?? {}, meta ?? {}, { functionRef: fn });
};
export const createGeneratedFunctionReference = (name) => ({
  [Symbol.for("functionName")]: name,
});
export const registerProcedureNameLookup = () => {};
export const typedProcedureResolver = (_functionRef, resolver) => resolver;
export const createGeneratedRegistryRuntime = () => ({
  getCallerFactory() {
    return () => ({});
  },
  getHandlerFactory() {
    return () => ({});
  },
});
`;

const resolveJitiExportTarget = (target: unknown): string | null => {
  if (typeof target === 'string') {
    return target;
  }
  if (Array.isArray(target)) {
    for (const entry of target) {
      const resolved = resolveJitiExportTarget(entry);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
  if (!target || typeof target !== 'object') {
    return null;
  }

  const record = target as Record<string, JitiExportTarget>;
  for (const condition of JITI_EXPORT_CONDITION_PRIORITY) {
    const resolved = resolveJitiExportTarget(record[condition]);
    if (resolved) {
      return resolved;
    }
  }
  for (const value of Object.values(record)) {
    const resolved = resolveJitiExportTarget(value);
    if (resolved) {
      return resolved;
    }
  }
  return null;
};

const buildLocalPackageExportAliases = (
  cwd: string,
  packageName: string
): Record<string, string> => {
  const packageDir = path.join(cwd, 'node_modules', ...packageName.split('/'));
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {};
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    exports?: Record<string, JitiExportTarget> | JitiExportTarget;
  };
  const exportsField = packageJson.exports;
  if (
    !exportsField ||
    typeof exportsField !== 'object' ||
    Array.isArray(exportsField)
  ) {
    return {};
  }

  const aliases: Record<string, string> = {};
  for (const [exportKey, exportTarget] of Object.entries(exportsField)) {
    const resolvedTarget = resolveJitiExportTarget(exportTarget);
    if (!resolvedTarget || !resolvedTarget.startsWith('./')) {
      continue;
    }

    const specifier =
      exportKey === '.'
        ? packageName
        : exportKey.startsWith('./')
          ? `${packageName}${exportKey.slice(1)}`
          : null;
    if (!specifier) {
      continue;
    }

    aliases[specifier] = path.join(packageDir, resolvedTarget);
  }

  return aliases;
};

const ensureServerParserShim = (cwd: string): string => {
  const shimDir = path.join(cwd, 'node_modules', '.kitcn');
  const shimPath = path.join(shimDir, 'project-jiti-server-shim.mjs');
  fs.mkdirSync(shimDir, { recursive: true });
  if (
    !fs.existsSync(shimPath) ||
    fs.readFileSync(shimPath, 'utf8') !== SERVER_PARSER_SHIM_SOURCE
  ) {
    fs.writeFileSync(shimPath, SERVER_PARSER_SHIM_SOURCE, 'utf8');
  }
  return shimPath;
};

const trimTsconfigWildcardSuffix = (value: string) =>
  value.endsWith('/*') ? value.slice(0, -2) : value;

const loadTypeScript = (): TypeScriptModule | null => {
  try {
    return require('typescript') as TypeScriptModule;
  } catch {
    return null;
  }
};

const buildTsconfigPathAliases = (cwd: string): Record<string, string> => {
  const typescript = loadTypeScript();
  if (!typescript) {
    return {};
  }
  const configPath = typescript.findConfigFile(
    cwd,
    fs.existsSync,
    'tsconfig.json'
  );
  if (!configPath) {
    return {};
  }

  const readResult = typescript.readConfigFile(
    configPath,
    typescript.sys.readFile
  );
  if (readResult.error) {
    return {};
  }

  const parsedConfig = typescript.parseJsonConfigFileContent(
    readResult.config,
    typescript.sys,
    path.dirname(configPath)
  );
  const baseUrl =
    typeof parsedConfig.options.baseUrl === 'string' &&
    parsedConfig.options.baseUrl.length > 0
      ? parsedConfig.options.baseUrl
      : path.dirname(configPath);
  const paths = parsedConfig.options.paths;
  if (!paths) {
    return {};
  }

  const aliases: Record<string, string> = {};
  for (const [specifier, targets] of Object.entries(paths)) {
    const firstTarget = targets[0];
    if (!firstTarget) {
      continue;
    }

    const aliasKey = trimTsconfigWildcardSuffix(specifier);
    const aliasTarget = trimTsconfigWildcardSuffix(firstTarget);
    if (!aliasKey || aliasKey === '*') {
      continue;
    }

    aliases[aliasKey] = path.resolve(baseUrl, aliasTarget);
  }

  return aliases;
};

const DECLARATION_FILE_RE = /\.d\.[cm]?ts$/;
const PATH_SEPARATOR_RE = /[\\/]/;

const isPackageLookupDir = (dir: string) => {
  const segments = dir.split(PATH_SEPARATOR_RE);
  const index = segments.lastIndexOf('node_modules');
  const depth = segments.length - 1 - index;
  return (
    index !== -1 &&
    (depth <= 1 || (depth === 2 && segments[index + 1]?.startsWith('@')))
  );
};

const getRuntimeConditions = () => {
  if (process.versions.bun) {
    return ['bun'];
  }
  const conditions = process.execArgv.includes('--no-addons')
    ? []
    : ['node-addons'];
  if ((process.features as { require_module?: boolean }).require_module) {
    conditions.push('module-sync');
  }
  return conditions;
};

/**
 * Selects the file a bare request maps to (package `imports`, `exports`,
 * self-references, workspace packages) whether or not it exists. Package
 * discovery stays on disk; declaration files never match, since the runtime
 * ignores `types`. TypeScript loads on first use.
 */
export const createMissingModuleResolver = (
  loadTypeScriptModule: () => TypeScriptModule | null = loadTypeScript
) => {
  let resolve:
    | ((request: string, parentFile: string) => string | undefined)
    | null
    | undefined;
  const init = () => {
    const typescript = loadTypeScriptModule();
    if (!typescript) {
      return null;
    }
    const { sys } = typescript;
    // TypeScript memoizes its own cwd process-wide. A temporary codegen cwd
    // must not become the default for later compiler calls in this process.
    const currentDirectory = process.cwd();
    const options = {
      customConditions: getRuntimeConditions(),
      module: typescript.ModuleKind.NodeNext,
      moduleResolution: typescript.ModuleResolutionKind.NodeNext,
    };
    const host = {
      directoryExists: (dir: string) =>
        !isPackageLookupDir(dir) || sys.directoryExists(dir),
      fileExists: (fileName: string) =>
        path.basename(fileName) === 'package.json'
          ? sys.fileExists(fileName)
          : !DECLARATION_FILE_RE.test(fileName),
      getCurrentDirectory: () => currentDirectory,
      readFile: sys.readFile,
      realpath: sys.realpath,
    };
    const cache = typescript.createModuleResolutionCache(
      currentDirectory,
      (fileName) =>
        sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
      options
    );
    return (request: string, parentFile: string) =>
      typescript.resolveModuleName(
        request,
        parentFile,
        options,
        host,
        cache,
        undefined,
        typescript.ModuleKind.CommonJS
      ).resolvedModule?.resolvedFileName;
  };
  return (request: string, parentFile: string): string | undefined => {
    try {
      if (resolve === undefined) {
        resolve = null;
        resolve = init();
      }
      return resolve?.(request, parentFile);
    } catch {
      return;
    }
  };
};

type MissingModuleFallback = (
  request: string,
  parentFile: string | undefined
) => string | undefined;

const missingModuleFallbacks = new Set<MissingModuleFallback>();
const MISSING_MODULE_BRIDGE_KEY = `kitcn.project-jiti.${import.meta.url}`;
const missingModuleBridge = Symbol.for(MISSING_MODULE_BRIDGE_KEY);
const projectImportGraph = new AsyncLocalStorage<{
  jiti: Jiti;
  cache: ModuleCache;
}>();
const PROJECT_SOURCE_EXTENSION_RE = /\.[cm]?[jt]sx?$/;
const JAVASCRIPT_SOURCE_EXTENSION_RE = /\.[cm]?jsx?$/;

type ModuleRequest = Parameters<Jiti['import']>;
type ModuleLoad = (...args: ModuleRequest) => unknown;
type ModuleResolver = (...args: ModuleRequest) => string | undefined;
type ModuleOperation = 'require' | 'import' | 'resolve';

const isProjectSource = (filename: string) =>
  path.isAbsolute(filename) &&
  !filename.split(path.sep).includes('node_modules') &&
  PROJECT_SOURCE_EXTENSION_RE.test(filename);

const isMissingModuleError = (error: unknown) =>
  error !== null &&
  typeof error === 'object' &&
  'code' in error &&
  (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_MODULE_NOT_FOUND');

const resolveRequestAlias = (
  request: string,
  aliases: Record<string, string>
) => {
  const entries = Object.entries(aliases).sort(
    ([left], [right]) => right.length - left.length
  );
  for (const [alias, target] of entries) {
    const prefix = alias.endsWith('/') ? alias.slice(0, -1) : alias;
    if (request === prefix || request.startsWith(`${prefix}/`)) {
      return `${target}${request.slice(prefix.length)}`;
    }
  }
  return request.startsWith('file:') ? fileURLToPath(request) : request;
};

const loadWithMissingModuleFallback = (
  load: ModuleLoad,
  resolve: ModuleResolver,
  args: ModuleRequest,
  parentFile: string | undefined,
  aliases: Record<string, string>,
  operation: ModuleOperation
) => {
  let resolved: string | undefined;
  let loadArgs = args;
  try {
    resolved = resolve(...args);
  } catch (error) {
    const [request, ...rest] = args;
    if (typeof request !== 'string' || !isMissingModuleError(error)) {
      throw error;
    }
    const normalizedRequest = resolveRequestAlias(request, aliases);
    for (const fallback of missingModuleFallbacks) {
      const target = fallback(normalizedRequest, parentFile);
      if (target) {
        loadArgs = [target, ...rest];
        resolved = resolve(...loadArgs);
        break;
      }
    }
    if (!resolved) {
      throw error;
    }
  }

  if (operation === 'resolve' || !resolved) {
    return load(...loadArgs);
  }
  const filename = resolved.startsWith('file:')
    ? fileURLToPath(resolved)
    : resolved;
  const graph = projectImportGraph.getStore();
  if (
    graph &&
    isProjectSource(filename) &&
    JAVASCRIPT_SOURCE_EXTENSION_RE.test(filename) &&
    !graph.cache[filename]
  ) {
    // Native-first CJS/ESM evaluation can execute side effects before a
    // missing runtime import fails. Transform project JS before executing it.
    return graph.jiti.evalModule(fs.readFileSync(filename, 'utf8'), {
      filename,
      async: operation === 'import',
      forceTranspile: true,
      cache: graph.cache,
    });
  }
  return load(...loadArgs);
};

const importProjectGraph = (
  jiti: Jiti,
  load: ModuleLoad,
  resolve: ModuleResolver,
  args: ModuleRequest,
  operation: 'require' | 'import'
) => {
  if (missingModuleFallbacks.size === 0) {
    return load(...args);
  }
  // Jiti propagates this cache through nested modules. Each root import gets
  // a fresh graph so cycles share exports without hiding later file edits.
  const cache: ModuleCache = Object.create(null);
  return projectImportGraph.run({ jiti, cache }, () => {
    const resolved = resolve(...args);
    const filename = resolved?.startsWith('file:')
      ? fileURLToPath(resolved)
      : resolved;
    if (!filename || !isProjectSource(filename)) {
      return load(...args);
    }
    return jiti.evalModule(fs.readFileSync(filename, 'utf8'), {
      filename,
      async: operation === 'import',
      forceTranspile: true,
      cache,
    });
  });
};

/**
 * Transformed imports consult fallbacks only after normal resolution fails.
 * A live callback also covers computed specifiers and release; patching
 * Node's global resolver loses createRequire's parent under Bun.
 */
export const registerMissingModuleFallback = (
  fallback: MissingModuleFallback
): (() => void) => {
  missingModuleFallbacks.add(fallback);
  Object.defineProperty(globalThis, missingModuleBridge, {
    configurable: true,
    value: loadWithMissingModuleFallback,
  });
  return () => {
    missingModuleFallbacks.delete(fallback);
    if (missingModuleFallbacks.size === 0) {
      Reflect.deleteProperty(globalThis, missingModuleBridge);
    }
  };
};

export const getProjectServerParserShimPath = (cwd = process.cwd()) =>
  ensureServerParserShim(cwd);

type BabelExpression = ReturnType<
  ReturnType<typeof loadBabelParser>['parseExpression']
>;
type BabelCall = Extract<BabelExpression, { type: 'CallExpression' }>;
type BabelCallPath = {
  node: BabelCall;
  scope: {
    getBinding: (name: string) => unknown;
    rename: (name: string) => void;
  };
};

const missingModuleTransform =
  (
    options: JitiOptions,
    transform: Jiti['transform']
  ): NonNullable<JitiOptions['transform']> =>
  (input) => ({
    code: transform({
      ...input,
      babel: {
        ...input.babel,
        plugins: [
          ...(input.babel?.plugins ?? []),
          () => ({
            visitor: {
              Program: {
                exit(program: {
                  traverse: (visitors: {
                    CallExpression: (call: BabelCallPath) => void;
                  }) => void;
                }) {
                  program.traverse({
                    CallExpression({ node, scope }) {
                      const callee = node.callee;
                      if (
                        callee.type !== 'Identifier' &&
                        callee.type !== 'MemberExpression'
                      ) {
                        return;
                      }
                      let name: string | undefined;
                      if (callee.type === 'Identifier') {
                        name = callee.name;
                      } else if (
                        callee.type === 'MemberExpression' &&
                        !callee.computed &&
                        callee.object.type === 'Identifier' &&
                        callee.object.name === 'require' &&
                        callee.property.type === 'Identifier' &&
                        callee.property.name === 'resolve'
                      ) {
                        name = 'require';
                      }
                      if (
                        !name ||
                        !['require', 'jitiImport', 'jitiESMResolve'].includes(
                          name
                        ) ||
                        scope.getBinding(name)
                      ) {
                        return;
                      }
                      const args = node.arguments.filter(
                        (argument) => argument.type !== 'ArgumentPlaceholder'
                      );
                      if (args.length !== node.arguments.length) {
                        return;
                      }
                      for (const globalName of ['Symbol', 'globalThis']) {
                        if (scope.getBinding(globalName)) {
                          scope.rename(globalName);
                        }
                      }
                      let operation: ModuleOperation = 'require';
                      if (name === 'jitiImport') {
                        operation = 'import';
                      } else if (
                        callee.type === 'MemberExpression' ||
                        name === 'jitiESMResolve'
                      ) {
                        operation = 'resolve';
                      }
                      const resolver =
                        operation === 'import' || name === 'jitiESMResolve'
                          ? 'jitiESMResolve'
                          : 'require.resolve';
                      node.callee = loadBabelParser().parseExpression(`
                        (function(load, args, resolve) {
                          const bridge = globalThis[Symbol.for(${JSON.stringify(MISSING_MODULE_BRIDGE_KEY)})];
                          return typeof bridge === 'function'
                            ? bridge(load, resolve, args, ${JSON.stringify(input.filename)}, ${JSON.stringify(options.alias ?? {})}, ${JSON.stringify(operation)})
                            : load(...args);
                        })
                      `);
                      node.arguments = [
                        callee,
                        { type: 'ArrayExpression', elements: args },
                        loadBabelParser().parseExpression(resolver),
                      ];
                    },
                  });
                },
              },
            },
          }),
        ],
      },
    }),
  });

export const createProjectJiti = (cwd = process.cwd()) => {
  const options: JitiOptions = {
    interopDefault: true,
    jsx: {
      runtime: 'automatic',
    },
    // jiti's runtime module cache is Node's process-global CJS cache. The
    // `kitcn dev` watcher is long-lived, so leaving it on without per-run
    // invalidation makes codegen blind to edits: a module imported once keeps
    // serving its first evaluation for the rest of the session. Turning it on
    // requires evicting every watchable project file (realpath outside
    // `node_modules`) at the start of each run.
    moduleCache: false,
    // The base transformer must not reuse Jiti's unnamespaced transform cache.
    fsCache: false,
    // Bun-native import bypasses Jiti aliasing for transitive project files.
    // Parse-time CLI imports need Jiti in the loop end-to-end.
    tryNative: false,
    alias: {
      ...buildTsconfigPathAliases(cwd),
      ...buildLocalPackageExportAliases(cwd, 'kitcn'),
      ...buildLocalPackageExportAliases(cwd, 'convex'),
      'kitcn/server': getProjectServerParserShimPath(cwd),
    },
  };
  const transformer = loadJiti().createJiti(cwd, options);
  // Jiti's cache omits custom transforms and aliases. Isolate transformed
  // source by both so callback registration can stay live without recompiling.
  const transformNamespace = createHash('sha256')
    .update(
      JSON.stringify([
        missingModuleTransform.toString(),
        MISSING_MODULE_BRIDGE_KEY,
        options.alias,
      ])
    )
    .digest('hex');
  const jiti = loadJiti().createJiti(cwd, {
    ...options,
    fsCache: path.join(tmpdir(), 'kitcn-project-jiti', transformNamespace),
    transform: missingModuleTransform(options, (input) =>
      transformer.transform(input)
    ),
  });
  return Object.assign(
    (id: string) =>
      importProjectGraph(
        jiti,
        jiti,
        (request) => jiti.resolve(request),
        [id],
        'require'
      ),
    jiti,
    {
      async import<T = unknown>(...args: ModuleRequest): Promise<T> {
        const result = await importProjectGraph(
          jiti,
          (request, requestOptions) =>
            jiti.import(request, { ...requestOptions, default: undefined }),
          (...requests) => jiti.esmResolve(...requests),
          args,
          'import'
        );
        return (
          args[1]?.default &&
          result !== null &&
          (typeof result === 'object' || typeof result === 'function') &&
          'default' in result
            ? (result.default ?? result)
            : result
        ) as T;
      },
    }
  );
};
