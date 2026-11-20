import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

const TSX_SOURCE_RE = /\.[cm]?tsx$/;
const TS_SOURCE_RE = /\.[cm]?ts$/;

type AstNode = { type: string } & Record<string, unknown>;

const isAstNode = (value: unknown): value is AstNode =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string';

const NAME_KEY_NODE_TYPES = new Set([
  'ObjectProperty',
  'ObjectMethod',
  'ClassMethod',
  'ClassProperty',
  'ClassPrivateProperty',
  'ClassAccessorProperty',
  'TSPropertySignature',
  'TSMethodSignature',
  'TSDeclareMethod',
]);
const TYPE_ONLY_NODE_TYPES = new Set([
  'TSImportType',
  'TSTypeReference',
  'TSTypeAnnotation',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSDeclareFunction',
]);

const REQUIRE_NON_LOADING_MEMBERS = new Set([
  'resolve',
  'cache',
  'main',
  'extensions',
]);

// `require` read as anything but a call, a non-loading member, a property name
// or `typeof` could load a module the scan cannot see.
const isRequireNameOnly = (node: AstNode, parent: AstNode | null) => {
  if (!parent) return false;
  if (parent.type === 'CallExpression' && parent.callee === node) return true;
  const isMember =
    parent.type === 'MemberExpression' ||
    parent.type === 'OptionalMemberExpression';
  if (isMember && parent.object === node) {
    const property = parent.property;
    return (
      !parent.computed &&
      isAstNode(property) &&
      REQUIRE_NON_LOADING_MEMBERS.has(property.name as string)
    );
  }
  if (isMember && parent.property === node && !parent.computed) return true;
  if (
    NAME_KEY_NODE_TYPES.has(parent.type) &&
    parent.key === node &&
    !parent.computed
  ) {
    return true;
  }
  if (parent.type === 'UnaryExpression' && parent.operator === 'typeof') {
    return true;
  }
  return parent.type === 'TSQualifiedName' || parent.type === 'TSTypeQuery';
};

const literalSpecifier = (node: unknown) => {
  if (!isAstNode(node)) return;
  if (node.type === 'StringLiteral') return node.value as string;
  if (
    node.type === 'TemplateLiteral' &&
    (node.expressions as unknown[]).length === 0
  ) {
    return (node.quasis as { value: { cooked: string } }[])[0]?.value.cooked;
  }
};

const callName = (node: AstNode) => {
  const callee = node.callee;
  return isAstNode(callee) && callee.type === 'Identifier'
    ? (callee.name as string)
    : undefined;
};

type StaticImports = { specifiers: string[]; opaque: boolean };

// The imports a static scan can follow in one project file. `opaque` marks a
// file that loads modules some other way, or does not parse.
const scanStaticImports = (filename: string): StaticImports => {
  let program: unknown;
  try {
    const plugins: ('typescript' | 'jsx')[] = TSX_SOURCE_RE.test(filename)
      ? ['typescript', 'jsx']
      : TS_SOURCE_RE.test(filename)
        ? ['typescript']
        : ['jsx'];
    program = loadBabelParser().parse(fs.readFileSync(filename, 'utf8'), {
      sourceType: 'unambiguous',
      plugins,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    }).program;
  } catch {
    return { specifiers: [], opaque: true };
  }
  const specifiers: string[] = [];
  let opaque = false;
  const visit = (node: unknown, parent: AstNode | null): void => {
    if (opaque || !isAstNode(node) || TYPE_ONLY_NODE_TYPES.has(node.type)) {
      return;
    }
    switch (node.type) {
      case 'ImportDeclaration':
        if (node.importKind !== 'type') {
          specifiers.push((node.source as { value: string }).value);
        }
        return;
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        if (isAstNode(node.source) && node.exportKind !== 'type') {
          specifiers.push(node.source.value as string);
        }
        break;
      case 'TSImportEqualsDeclaration': {
        const reference = node.moduleReference;
        if (
          node.importKind !== 'type' &&
          isAstNode(reference) &&
          reference.type === 'TSExternalModuleReference'
        ) {
          specifiers.push((reference.expression as { value: string }).value);
        }
        return;
      }
      case 'ImportExpression':
      case 'CallExpression':
      case 'NewExpression': {
        const isImport =
          node.type === 'ImportExpression' ||
          (isAstNode(node.callee) && node.callee.type === 'Import');
        const name =
          node.type === 'ImportExpression' ? undefined : callName(node);
        if (
          isImport ||
          (name === 'require' && node.type === 'CallExpression')
        ) {
          const specifier = literalSpecifier(
            node.type === 'ImportExpression'
              ? node.source
              : (node.arguments as unknown[])[0]
          );
          if (specifier === undefined) opaque = true;
          else specifiers.push(specifier);
        }
        if (name === 'eval' || name === 'Function') opaque = true;
        break;
      }
      case 'Identifier':
        if (
          node.name === 'createRequire' ||
          (node.name === 'require' && !isRequireNameOnly(node, parent))
        ) {
          opaque = true;
        }
        break;
      case 'MemberExpression':
        if (
          isAstNode(node.object) &&
          node.object.type === 'Identifier' &&
          node.object.name === 'module' &&
          !node.computed &&
          isAstNode(node.property) &&
          node.property.name === 'require'
        ) {
          opaque = true;
        }
        break;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key.endsWith('Comments') || key === 'extra')
        continue;
      if (Array.isArray(value)) for (const child of value) visit(child, node);
      else visit(value, node);
    }
  };
  visit(program, null);
  return { specifiers, opaque };
};

type ProjectGraphPlan = {
  isShareable: (filename: string) => boolean;
  reaches: (filename: string, targets: Set<string>) => boolean;
};

// Which roots may share the run's graph: those whose static import closure
// holds no import cycle and nothing opaque. Imports resolve through the run's
// own jiti and the missing-module fallbacks it consults.
export const planProjectGraph = (
  jiti: Jiti,
  rootFiles: string[]
): ProjectGraphPlan => {
  const aliases = jiti.options.alias ?? {};
  const edges = new Map<string, Set<string>>();
  const opaque = new Set<string>();
  const resolveStatic = (specifier: string, parentFile: string) => {
    let target: string | undefined;
    try {
      target = jiti.esmResolve(specifier, {
        parentURL: pathToFileURL(parentFile).href,
        try: true,
      });
    } catch {
      target = undefined;
    }
    if (!target) {
      const request = resolveRequestAlias(specifier, aliases);
      for (const fallback of missingModuleFallbacks) {
        target = fallback(request, parentFile);
        if (target) break;
      }
    }
    if (!target) return null;
    return target.startsWith('file:') ? fileURLToPath(target) : target;
  };

  const pending = [...rootFiles];
  while (pending.length > 0) {
    const filename = pending.pop() as string;
    if (edges.has(filename)) continue;
    const targets = new Set<string>();
    edges.set(filename, targets);
    const scan = scanStaticImports(filename);
    if (scan.opaque) opaque.add(filename);
    for (const specifier of scan.specifiers) {
      const target = resolveStatic(specifier, filename);
      if (target === null) {
        opaque.add(filename);
        continue;
      }
      if (!isProjectSource(target)) continue;
      targets.add(target);
      pending.push(target);
    }
  }

  // Tarjan's strongly connected components. A component closes when all its
  // successors have, so `unsafe` is final for them by then.
  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const componentOf = new Map<string, number>();
  const unsafe = new Set<string>();
  const visit = (filename: string) => {
    order.set(filename, order.size);
    low.set(filename, order.get(filename) as number);
    stack.push(filename);
    onStack.add(filename);
    for (const target of edges.get(filename) ?? []) {
      if (!order.has(target)) {
        visit(target);
        low.set(
          filename,
          Math.min(low.get(filename) as number, low.get(target) as number)
        );
      } else if (onStack.has(target)) {
        low.set(
          filename,
          Math.min(low.get(filename) as number, order.get(target) as number)
        );
      }
    }
    if (low.get(filename) !== order.get(filename)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop() as string;
      onStack.delete(member);
      component.push(member);
    } while (member !== filename);
    const id = componentOf.size;
    for (const file of component) componentOf.set(file, id);
    let componentUnsafe =
      component.length > 1 || (edges.get(filename)?.has(filename) ?? false);
    for (const file of component) {
      if (opaque.has(file)) componentUnsafe = true;
      for (const target of edges.get(file) ?? []) {
        if (componentOf.get(target) !== id && unsafe.has(target)) {
          componentUnsafe = true;
        }
      }
    }
    if (componentUnsafe) for (const file of component) unsafe.add(file);
  };
  for (const filename of edges.keys()) {
    if (!order.has(filename)) visit(filename);
  }

  return {
    isShareable: (filename) => edges.has(filename) && !unsafe.has(filename),
    reaches: (filename, targets) => {
      const seen = new Set<string>();
      const queue = [filename];
      while (queue.length > 0) {
        const file = queue.pop() as string;
        if (seen.has(file)) continue;
        seen.add(file);
        if (targets.has(file)) return true;
        for (const target of edges.get(file) ?? []) queue.push(target);
      }
      return false;
    },
  };
};

type SharedProjectGraph = {
  plan: ProjectGraphPlan;
  target: ModuleCache;
  cache: ModuleCache;
  root: string | undefined;
  violation: Error | undefined;
};

const sharedProjectGraph = new AsyncLocalStorage<SharedProjectGraph>();

// One graph for the roots the plan lets share: an entry is created once and
// never replaced or removed, and a read of an entry that has not finished
// loading while a root evaluates aborts that root. Such a read means a cycle or
// a failed module the plan did not see, and sharing it would hand the reader a
// partial module.
const createSharedProjectGraph = (
  plan: ProjectGraphPlan
): SharedProjectGraph => {
  const target: ModuleCache = Object.create(null);
  const graph: SharedProjectGraph = {
    plan,
    target,
    cache: target,
    root: undefined,
    violation: undefined,
  };
  const relative = (filename: string) => path.relative(process.cwd(), filename);
  // Kept as well as thrown, so the root is rejected after it evaluates even
  // if project code caught the error.
  const violate = (message: string): never => {
    const error = new Error(message);
    graph.violation ??= error;
    throw error;
  };
  graph.cache = new Proxy(target, {
    get(cacheTarget, key, receiver) {
      const entry = Reflect.get(cacheTarget, key, receiver);
      if (
        graph.root &&
        typeof key === 'string' &&
        entry &&
        entry.loaded !== true
      ) {
        violate(
          `kitcn codegen: ${relative(graph.root)} reached ${relative(key)} before it finished loading in the shared module graph`
        );
      }
      return entry;
    },
    set(cacheTarget, key, value, receiver) {
      if (typeof key === 'string' && Object.hasOwn(cacheTarget, key)) {
        violate(
          `kitcn codegen: ${relative(key)} would be evaluated twice in the shared module graph`
        );
      }
      return Reflect.set(cacheTarget, key, value, receiver);
    },
    deleteProperty(_cacheTarget, key) {
      return violate(
        `kitcn codegen: ${String(key)} would be removed from the shared module graph`
      );
    },
  });
  return graph;
};

export const withSharedProjectGraph = <T>(
  plan: ProjectGraphPlan,
  fn: () => Promise<T>
): Promise<T> => sharedProjectGraph.run(createSharedProjectGraph(plan), fn);

// The view jiti's `interopDefault` gives an evaluated module, so a reused root
// reads as an evaluated one.
const interopDefaultView = (mod: unknown): unknown => {
  if (mod === null || (typeof mod !== 'object' && typeof mod !== 'function')) {
    return mod;
  }
  const exports = mod as Record<PropertyKey, unknown>;
  const fallback = exports.default;
  const fallbackIsNil = fallback === null || fallback === undefined;
  if (fallbackIsNil && mod instanceof Promise) return mod;
  const mergeDefault =
    (typeof fallback === 'object' || typeof fallback === 'function') &&
    !(fallback instanceof Promise);
  const seen = new Map<PropertyKey, unknown>();
  return new Proxy(exports, {
    get(target, key) {
      if (seen.has(key)) return seen.get(key);
      let value: unknown;
      if (key === '__esModule') value = true;
      else if (key === 'default') {
        const nested = (fallback as { default?: unknown } | undefined)?.default;
        value = fallbackIsNil
          ? mod
          : typeof nested === 'function' && exports.__esModule
            ? nested
            : fallback;
      } else if (key in target) value = target[key];
      else if (mergeDefault) {
        value = (fallback as Record<PropertyKey, unknown>)[key];
        if (typeof value === 'function') value = value.bind(fallback);
      }
      seen.set(key, value);
      return value;
    },
    apply:
      typeof fallback === 'function' && typeof mod !== 'function'
        ? (_target, thisArg, args) =>
            Reflect.apply(
              fallback as (...a: unknown[]) => unknown,
              thisArg,
              args
            )
        : undefined,
  });
};

// Runs one root in the mode its plan gives it: `evaluate` receives the shared
// graph's cache, or `undefined` to evaluate in a graph of its own. A root that
// reaches a module an earlier root left unfinished runs in its own graph, so a
// failing module fails each importer as it would alone.
export const evaluateProjectRoot = (
  filename: string,
  evaluate: (cache: ModuleCache | undefined) => unknown,
  operation: 'require' | 'import'
): unknown => {
  const shared = sharedProjectGraph.getStore();
  if (!shared?.plan.isShareable(filename)) return evaluate(undefined);
  const unfinished = new Set(
    Object.keys(shared.target).filter(
      (key) => shared.target[key]?.loaded !== true
    )
  );
  if (unfinished.size > 0 && shared.plan.reaches(filename, unfinished)) {
    return evaluate(undefined);
  }
  const existing = shared.target[filename];
  if (existing) {
    const view = interopDefaultView(existing.exports);
    return operation === 'require' ? view : Promise.resolve(view);
  }
  shared.root = filename;
  const finish = () => {
    shared.root = undefined;
    const violation = shared.violation;
    shared.violation = undefined;
    return violation;
  };
  let result: unknown;
  try {
    result = evaluate(shared.cache);
  } catch (error) {
    throw finish() ?? error;
  }
  if (result instanceof Promise) {
    return result.then(
      (value) => {
        const violation = finish();
        if (violation) throw violation;
        return value;
      },
      (error) => {
        throw finish() ?? error;
      }
    );
  }
  const violation = finish();
  if (violation) throw violation;
  return result;
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
  // a fresh graph so cycles share exports without hiding later file edits,
  // unless the parse loop planned a shared graph for it.
  return projectImportGraph.run(
    { jiti, cache: Object.create(null) },
    (): unknown => {
      const resolved = resolve(...args);
      const filename = resolved?.startsWith('file:')
        ? fileURLToPath(resolved)
        : resolved;
      if (!filename || !isProjectSource(filename)) {
        return load(...args);
      }
      return evaluateProjectRoot(
        filename,
        (sharedCache) => {
          const cache: ModuleCache = sharedCache ?? Object.create(null);
          return projectImportGraph.run({ jiti, cache }, () =>
            jiti.evalModule(fs.readFileSync(filename, 'utf8'), {
              filename,
              async: operation === 'import',
              forceTranspile: true,
              cache,
            })
          );
        },
        operation
      );
    }
  );
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
