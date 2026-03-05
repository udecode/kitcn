import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { type BuildResult, build, type Plugin } from 'esbuild';
import { createJiti } from 'jiti';

const MB = 1024 * 1024;

const DEFAULT_WARNING_MB = 6;
const DEFAULT_DANGER_MB = 8;
const DEFAULT_TOP_INPUTS = 12;
const DEFAULT_TOP_PACKAGES = 12;
const DEFAULT_DETAIL_ENTRIES = 20;
const DEFAULT_OUTPUT_WIDTH = 120;
const SMALL_INPUT_MIN_BYTES = 8 * 1024;
const SMALL_INPUT_MIN_SHARE = 0.002; // 0.2%

const WHITESPACE_SPLIT_REGEX = /\s+/;
const NEWLINE_SPLIT_REGEX = /\r?\n/;
const ENTRY_POINT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);
const SCHEMA_RESOLVE_FILTER = /^\.{1,2}\/schema(\.ts|\.js)?$/;
const USE_NODE_DIRECTIVE_REGEX = /^\s*("|')use node\1;?\s*$/;
const VALID_IDENTIFIER_REGEX = /^[a-zA-Z_$][\w$]*$/;
const EXPORTED_CONST_CAPTURE_REGEX = /export\s+const\s+([a-zA-Z_$][\w$]*)\s*=/g;
const CHAINED_PROCEDURE_CAPTURE_REGEX = /\.\s*(?:query|mutation|action)\s*\(/;
const EXPORTED_NATIVE_HANDLER_CAPTURE_REGEX =
  /export\s+const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:[\w$]+\.)?(?:query|mutation|action|internalQuery|internalMutation|internalAction)\s*\(/g;
const EXPORTED_ORM_API_DESTRUCTURE_CAPTURE_REGEX =
  /export\s+const\s*\{([^}]+)\}\s*=\s*orm\.api\s*\(\s*\)\s*;?/g;

const supportsColor =
  process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';
const isInteractiveTerminal = process.stdin.isTTY && process.stdout.isTTY;

let colorEnabled = supportsColor;
let outputWidth = process.stdout.columns ?? DEFAULT_OUTPUT_WIDTH;

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
} as const;

type AnalyzeMode = 'deploy' | 'hotspot';

type AnalyzeOptions = {
  mode: AnalyzeMode;
  entryPattern: string | null;
  details: boolean;
  showInputs: boolean;
  interactive: 'always' | 'never';
  includeGenerated: boolean;
  showSmall: boolean;
  width: number | null;
  topInputs: number;
  topPackages: number;
  detailEntries: number;
  warningMb: number;
  dangerMb: number;
  failMb: number | null;
};

type MetaInput = {
  bytes?: number;
  imports?: Array<{ path?: string }>;
};

type MetaOutput = {
  bytes: number;
  entryPoint?: string;
  inputs?: Record<string, { bytesInOutput?: number }>;
};

type AnalyzeRowBase = {
  entry: string;
  inputCount: number;
  localInputBytes: number;
  dependencyInputBytes: number;
  totalInputBytes: number;
  outputBytes: number;
  schemaExternalized: boolean;
};

type HotspotDeep = {
  importsByInput: Record<string, string[]>;
  outputInputs: Array<{
    path: string;
    bytesInOutput: number;
    sourceBytes: number;
  }>;
};

type HotspotRow = AnalyzeRowBase & {
  handlerExports: string[];
  deep?: HotspotDeep;
};

type HotspotAnalyzedRow = Omit<HotspotRow, 'handlerExports'>;

type HotspotSortKey = 'out' | 'dep' | 'fns';
type HotspotDetailPane = 'handlers' | 'packages' | 'inputs';

type HotspotCollection = {
  isolateEntries: string[];
  generatedEntries: string[];
  entryPoints: string[];
  successRows: HotspotRow[];
  failedRows: FailedRow[];
  handlerExportsByEntry: Map<string, string[]>;
};

type FailedRow = {
  entry: string;
  error: string;
};

type ProjectRoots = {
  projectRoot: string;
  functionsRoot: string;
};

type DeployEntryOutput = {
  outputPath: string;
  entryPoint: string;
  bytes: number;
  inputCount: number;
};

type DeployChunkOutput = {
  outputPath: string;
  bytes: number;
};

type AnalyzeEntrySelection = {
  nodeEntryPoints: string[];
  isolateEntries: string[];
  generatedEntries: string[];
  entryPoints: string[];
  handlerExportsByEntry: Map<string, string[]>;
};

const dedupe = (values: string[]): string[] => Array.from(new Set(values));

const formatBytes = (bytes: number): string => `${(bytes / MB).toFixed(2)} MB`;
const toMB = (bytes: number): string => (bytes / MB).toFixed(2);

const truncate = (value: string, maxWidth: number): string => {
  if (value.length <= maxWidth) {
    return value;
  }
  if (maxWidth <= 3) {
    return value.slice(0, maxWidth);
  }
  return `${value.slice(0, maxWidth - 3)}...`;
};

const pad = (
  value: string,
  width: number,
  align: 'left' | 'right' = 'left'
): string => {
  if (align === 'right') {
    return value.padStart(width, ' ');
  }
  return value.padEnd(width, ' ');
};

const colorize = (value: string, color: string): string => {
  if (!colorEnabled) return value;
  return `${color}${value}${ANSI.reset}`;
};

const bold = (value: string): string => colorize(value, ANSI.bold);
const dim = (value: string): string => colorize(value, ANSI.dim);

const shareColor = (sharePercent: number): string => {
  if (sharePercent >= 25) return ANSI.red;
  if (sharePercent >= 10) return ANSI.yellow;
  if (sharePercent >= 3) return ANSI.cyan;
  return ANSI.gray;
};

const severityColor = (severity: 'DANGER' | 'WARN' | 'OK'): string => {
  if (severity === 'DANGER') return ANSI.red;
  if (severity === 'WARN') return ANSI.yellow;
  return ANSI.green;
};

const makeShareBar = (sharePercent: number, width = 16): string => {
  const clamped = Math.max(0, Math.min(100, sharePercent));
  const filled = Math.round((clamped / 100) * width);
  const bar = `${'#'.repeat(filled)}${'.'.repeat(Math.max(0, width - filled))}`;
  return colorize(bar, shareColor(sharePercent));
};

const colorizePadded = (
  value: string,
  width: number,
  align: 'left' | 'right',
  color: string
): string => colorize(pad(value, width, align), color);

const ESCAPE_PREFIX = '\\x1b';
const ANSI_PATTERN = new RegExp(`${ESCAPE_PREFIX}\\[[0-9;]*m`, 'g');
const visibleLength = (value: string): number =>
  value.replace(ANSI_PATTERN, '').length;

const wrapPlain = (text: string, width: number): string[] => {
  const maxWidth = Math.max(16, width);
  const words = text.split(WHITESPACE_SPLIT_REGEX).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= maxWidth) {
      current += ` ${word}`;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  return lines;
};

const printWrapped = ({
  indent = 0,
  prefix = '',
  text,
  color = null,
}: {
  indent?: number;
  prefix?: string;
  text: string;
  color?: string | null;
}): void => {
  const indentStr = ' '.repeat(Math.max(0, indent));
  const prefixLen = visibleLength(prefix);
  const available = Math.max(16, outputWidth - indent - prefixLen);
  const lines = wrapPlain(text, available);
  lines.forEach((line, index) => {
    const leader = index === 0 ? prefix : ' '.repeat(prefixLen);
    const body = color ? colorize(line, color) : line;
    console.log(`${indentStr}${leader}${body}`);
  });
};

const firstLine = (value: string): string => value.split('\n').at(0) ?? value;

const normalizeOutputPath = (filePath: string): string =>
  filePath.split(path.sep).join('/');

const pathHasMultipleDots = (base: string): boolean =>
  (base.match(/\./g) ?? []).length > 1;

const shellQuote = (value: string): string =>
  `'${value.replace(/'/g, `'\\''`)}'`;

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const walkDeployEntryPoints = (
  dir: string,
  options?: { includeMultiDot?: boolean; includeGeneratedDir?: boolean }
): string[] => {
  const files: string[] = [];
  const includeMultiDot = options?.includeMultiDot ?? false;
  const includeGeneratedDir = options?.includeGeneratedDir ?? false;

  const visit = (currentDir: string): void => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '_generated') {
          continue;
        }
        if (entry.name === 'generated' && !includeGeneratedDir) {
          continue;
        }
        visit(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const relPath = path.relative(dir, fullPath);
      const normalizedRelPath = normalizeOutputPath(relPath);
      const parsed = path.parse(fullPath);
      const base = parsed.base;
      const ext = parsed.ext.toLowerCase();

      if (normalizedRelPath.startsWith('_deps/')) {
        continue;
      }
      if (!ENTRY_POINT_EXTENSIONS.has(ext)) {
        continue;
      }
      if (base.startsWith('.') || base.startsWith('#')) {
        continue;
      }
      if (base === 'schema.ts' || base === 'schema.js') {
        continue;
      }
      if (!includeMultiDot && pathHasMultipleDots(base)) {
        continue;
      }
      if (normalizedRelPath.includes(' ')) {
        continue;
      }

      files.push(fullPath);
    }
  };

  visit(dir);
  return files;
};

const detectProjectRoots = (): ProjectRoots => {
  const projectRoot = process.cwd();
  const convexConfigPath = path.join(projectRoot, 'convex.json');
  const configuredFunctionsRoot = (() => {
    if (!fs.existsSync(convexConfigPath)) {
      return null;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(convexConfigPath, 'utf8')) as {
        functions?: unknown;
      };
      return typeof parsed.functions === 'string' && parsed.functions.length > 0
        ? path.join(projectRoot, parsed.functions)
        : null;
    } catch {
      return null;
    }
  })();
  const preferredFunctionsRoot = path.join(projectRoot, 'convex', 'functions');
  const fallbackFunctionsRoot = path.join(projectRoot, 'convex');

  if (configuredFunctionsRoot && fs.existsSync(configuredFunctionsRoot)) {
    return {
      projectRoot,
      functionsRoot: configuredFunctionsRoot,
    };
  }

  if (fs.existsSync(preferredFunctionsRoot)) {
    return {
      projectRoot,
      functionsRoot: preferredFunctionsRoot,
    };
  }

  if (fs.existsSync(fallbackFunctionsRoot)) {
    return {
      projectRoot,
      functionsRoot: fallbackFunctionsRoot,
    };
  }

  throw new Error(
    `Missing Convex functions directory. Expected one of:\n- ${configuredFunctionsRoot ?? '<convex.json functions>'}\n- ${preferredFunctionsRoot}\n- ${fallbackFunctionsRoot}`
  );
};

const hasUseNodeDirective = (source: string): boolean => {
  if (!source.includes('use node')) {
    return false;
  }

  const lines = source.split(NEWLINE_SPLIT_REGEX);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('//')) {
      continue;
    }

    if (trimmed.startsWith('/*')) {
      continue;
    }

    return USE_NODE_DIRECTIVE_REGEX.test(trimmed);
  }

  return false;
};

const isNodeEntryPoint = (
  entryPoint: string,
  functionsRoot: string
): boolean => {
  const rel = normalizeOutputPath(path.relative(functionsRoot, entryPoint));
  if (rel.startsWith('actions/')) {
    return true;
  }

  const source = fs.readFileSync(entryPoint, 'utf8');
  return hasUseNodeDirective(source);
};

type RuntimeProcedureMeta = {
  type?: unknown;
};

const hasRuntimeProcedureType = (
  value: unknown
): value is 'query' | 'mutation' | 'action' =>
  value === 'query' || value === 'mutation' || value === 'action';

const getNativeHandlerExportNames = (source: string): string[] => {
  const exportNames = new Set(
    Array.from(source.matchAll(EXPORTED_NATIVE_HANDLER_CAPTURE_REGEX))
      .map((match) => match[1])
      .filter((name): name is string => !!name)
  );

  const exportConstMatches = Array.from(
    source.matchAll(EXPORTED_CONST_CAPTURE_REGEX)
  );
  for (const [index, match] of exportConstMatches.entries()) {
    const exportName = match[1];
    if (!exportName) {
      continue;
    }
    const start = (match.index ?? 0) + match[0].length;
    const end = exportConstMatches[index + 1]?.index ?? source.length;
    const initializerSlice = source.slice(start, end);
    if (CHAINED_PROCEDURE_CAPTURE_REGEX.test(initializerSlice)) {
      exportNames.add(exportName);
    }
  }

  for (const match of source.matchAll(
    EXPORTED_ORM_API_DESTRUCTURE_CAPTURE_REGEX
  )) {
    const bindings = match[1];
    for (const binding of bindings.split(',')) {
      const trimmed = binding.trim();
      if (!trimmed || trimmed.startsWith('...')) {
        continue;
      }
      const withoutDefault = trimmed.split('=')[0]?.trim() ?? '';
      const localBinding =
        withoutDefault.split(':')[1]?.trim() ?? withoutDefault;
      if (VALID_IDENTIFIER_REGEX.test(localBinding)) {
        exportNames.add(localBinding);
      }
    }
  }

  return Array.from(exportNames);
};

const listConvexHandlerExports = async (
  entryPoint: string,
  jitiInstance: ReturnType<typeof createJiti>
): Promise<string[]> => {
  const exportNames = new Set<string>();
  const source = fs.readFileSync(entryPoint, 'utf8');

  for (const exportName of getNativeHandlerExportNames(source)) {
    exportNames.add(exportName);
  }

  try {
    const module = await jitiInstance.import(entryPoint);
    if (module && typeof module === 'object') {
      for (const [name, value] of Object.entries(module)) {
        if (name.startsWith('_')) {
          continue;
        }
        const meta = (value as { _crpcMeta?: RuntimeProcedureMeta })._crpcMeta;
        if (hasRuntimeProcedureType(meta?.type)) {
          exportNames.add(name);
        }
      }
    }
  } catch {
    // Ignore module import failures here; source-level native handlers were
    // already captured and we keep analyzer resilient to project-specific deps.
  }

  return Array.from(exportNames).sort((a, b) => a.localeCompare(b));
};

const scanHandlerExportsByEntry = async (
  entryPoints: string[]
): Promise<Map<string, string[]>> => {
  // Signal to createEnv that we are in the CLI's Node.js parse context.
  // Use globalThis instead of process.env so Convex's auth-config env-var
  // scanner never sees this as a required dashboard variable.
  (globalThis as Record<string, unknown>).__BETTER_CONVEX_CODEGEN__ = true;

  try {
    const jitiInstance = createJiti(process.cwd(), {
      interopDefault: true,
      moduleCache: false,
    });

    const results = await Promise.all(
      entryPoints.map(async (entryPoint) => ({
        entryPoint,
        exportNames: await listConvexHandlerExports(entryPoint, jitiInstance),
      }))
    );

    const byEntry = new Map<string, string[]>();
    for (const result of results) {
      if (result.exportNames.length > 0) {
        byEntry.set(result.entryPoint, result.exportNames);
      }
    }
    return byEntry;
  } finally {
    // biome-ignore lint/performance/noDelete: globalThis property, not a plain object — delete is correct here
    delete (globalThis as Record<string, unknown>).__BETTER_CONVEX_CODEGEN__;
  }
};

const parseArgs = (argv: string[]): AnalyzeOptions => {
  const options: AnalyzeOptions = {
    mode: 'hotspot',
    entryPattern: null,
    details: false,
    showInputs: false,
    interactive: 'never',
    includeGenerated: false,
    showSmall: false,
    width: null,
    topInputs: DEFAULT_TOP_INPUTS,
    topPackages: DEFAULT_TOP_PACKAGES,
    detailEntries: DEFAULT_DETAIL_ENTRIES,
    warningMb: DEFAULT_WARNING_MB,
    dangerMb: DEFAULT_DANGER_MB,
    failMb: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--hotspot') {
      throw new Error(
        '`--hotspot` was removed. Hotspot is the default mode, so just run `better-convex analyze`.'
      );
    }

    if (arg === '--deploy') {
      options.mode = 'deploy';
      continue;
    }

    if (arg === '--entry' || arg.startsWith('--entry=')) {
      throw new Error(
        '`--entry` was removed. Pass the entry regex as the first positional argument, e.g. `better-convex analyze polar.*`.'
      );
    }
    if (
      arg === '--detail-entries' ||
      arg.startsWith('--detail-entries=') ||
      arg === '--top' ||
      arg.startsWith('--top=')
    ) {
      throw new Error(
        '`--top` and `--detail-entries` were removed. The analyzer now uses built-in detail defaults.'
      );
    }

    if (arg === '--details') {
      options.details = true;
      continue;
    }

    if (arg === '--input') {
      options.showInputs = true;
      continue;
    }

    if (arg === '--interactive' || arg === '-i') {
      options.interactive = 'always';
      continue;
    }

    if (arg === '--no-interactive' || arg === '-I') {
      throw new Error(
        '`--no-interactive` was removed. Non-interactive is already the default.'
      );
    }

    if (arg === '--all' || arg === '-a') {
      options.includeGenerated = true;
      continue;
    }

    if (!arg.startsWith('-')) {
      if (options.entryPattern !== null) {
        throw new Error(
          `Only one positional entry regex is allowed. Received "${options.entryPattern}" and "${arg}".`
        );
      }
      options.entryPattern = arg;
      continue;
    }

    if (arg === '--show-small') {
      options.showSmall = true;
      continue;
    }

    if (arg === '--width' && next) {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed) && parsed >= 60) {
        options.width = parsed;
      }
      i += 1;
      continue;
    }

    if (arg === '--top-inputs' && next) {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.topInputs = parsed;
      }
      i += 1;
      continue;
    }

    if (arg === '--top-packages' && next) {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.topPackages = parsed;
      }
      i += 1;
      continue;
    }

    if (arg === '--warn-mb' && next) {
      const parsed = Number.parseFloat(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.warningMb = parsed;
      }
      i += 1;
      continue;
    }

    if (arg === '--danger-mb' && next) {
      const parsed = Number.parseFloat(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.dangerMb = parsed;
      }
      i += 1;
      continue;
    }

    if (arg === '--fail-mb' && next) {
      const parsed = Number.parseFloat(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.failMb = parsed;
      }
      i += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  better-convex analyze [entryRegex]
  better-convex analyze --deploy
  better-convex analyze '^convex/functions/auth\\.ts$' --details

Modes:
  (default)            Hotspot analysis (per-function isolate ranking)
  --deploy             Deploy analysis (single isolate bundle, Convex-like)

Flags:
  --details            Show extra per-entry/package details
  --input              Include top internal inputs in detail output
  --interactive, -i    Enable interactive hotspot UI (default: off, TTY only)
  --all, -a           Include all Convex-ignored entries (multi-dot files + generated/, even without handlers)
  --show-small         Include tiny dependencies (hidden by default)
  --width <n>          Force output width (min 60)
  --top-inputs <n>     Rows for input tables (default ${DEFAULT_TOP_INPUTS})
  --top-packages <n>   Rows for package tables (default ${DEFAULT_TOP_PACKAGES})
  --warn-mb <n>        WARN threshold per entry/chunk (default ${DEFAULT_WARNING_MB})
  --danger-mb <n>      DANGER threshold per entry/chunk (default ${DEFAULT_DANGER_MB})
  --fail-mb <n>        Exit 1 if largest entry/chunk >= n MB`);
      process.exit(0);
    }
  }

  if (options.mode === 'deploy' && options.interactive === 'always') {
    throw new Error(
      '`--interactive` is hotspot-only. Remove it when using `--deploy`.'
    );
  }

  return options;
};

const schemaExternalFallbackPlugin: Plugin = {
  name: 'schema-external-fallback',
  setup(buildCtx) {
    buildCtx.onResolve({ filter: SCHEMA_RESOLVE_FILTER }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

const shouldRetryWithSchemaExternalized = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('No matching export') &&
    (message.includes('schema.ts') || message.includes('/schema'))
  );
};

const severityForBytes = (
  bytes: number,
  options: AnalyzeOptions
): 'DANGER' | 'WARN' | 'OK' => {
  const outputMb = bytes / MB;
  if (outputMb >= options.dangerMb) {
    return 'DANGER';
  }
  if (outputMb >= options.warningMb) {
    return 'WARN';
  }
  return 'OK';
};

const smallInputThreshold = (outputBytes: number): number =>
  Math.max(
    SMALL_INPUT_MIN_BYTES,
    Math.floor(outputBytes * SMALL_INPUT_MIN_SHARE)
  );

const isSmallInput = (
  bytesInOutput: number,
  outputBytes: number,
  showSmall: boolean
): boolean => !showSmall && bytesInOutput < smallInputThreshold(outputBytes);

const shortPath = (inputPath: string): string => {
  if (inputPath.startsWith('convex/functions/')) {
    return `fn/${inputPath.slice('convex/functions/'.length)}`;
  }
  if (inputPath.startsWith('convex/lib/')) {
    return `lib/${inputPath.slice('convex/lib/'.length)}`;
  }
  if (inputPath.startsWith('../packages/better-convex/dist/')) {
    return `bcx/${inputPath.slice('../packages/better-convex/dist/'.length)}`;
  }
  if (inputPath.startsWith('../node_modules/')) {
    return `nm/${inputPath.slice('../node_modules/'.length)}`;
  }
  if (inputPath.startsWith('example/convex/')) {
    return `convex/${inputPath.slice('example/convex/'.length)}`;
  }
  return inputPath;
};

const compactPath = (inputPath: string, maxWidth: number): string =>
  truncate(shortPath(inputPath), Math.max(16, maxWidth));

const isNodeModulesInputPath = (inputPath: string): boolean =>
  inputPath.includes('node_modules/');

const packageFromInputPath = (inputPath: string): string => {
  const nodeModulesToken = 'node_modules/';
  const idx = inputPath.lastIndexOf(nodeModulesToken);
  if (idx >= 0) {
    const fromNodeModules = inputPath.slice(idx + nodeModulesToken.length);
    const [first, second] = fromNodeModules.split('/');
    if (!first) return '(node_modules)';
    if (first.startsWith('@') && second) {
      return `${first}/${second}`;
    }
    return first;
  }

  if (inputPath.startsWith('convex/')) {
    return 'workspace:convex';
  }
  if (inputPath.startsWith('../packages/')) {
    const parts = inputPath.replace('../', '').split('/');
    return parts.length >= 2
      ? `workspace:${parts[0]}/${parts[1]}`
      : 'workspace:packages';
  }
  if (inputPath.startsWith('packages/')) {
    const parts = inputPath.split('/');
    return parts.length >= 2
      ? `workspace:${parts[0]}/${parts[1]}`
      : 'workspace:packages';
  }

  return '(other)';
};

const buildHotspotEntry = (entryPoint: string, externalizeSchema: boolean) =>
  build({
    bundle: true,
    entryPoints: [entryPoint],
    external: ['convex', 'convex/*'],
    format: 'esm',
    logLevel: 'silent',
    metafile: true,
    platform: 'browser',
    target: ['esnext'],
    conditions: ['convex', 'module'],
    minifySyntax: true,
    minifyIdentifiers: true,
    minifyWhitespace: false,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    write: false,
    plugins: externalizeSchema ? [schemaExternalFallbackPlugin] : [],
  });

const analyzeHotspotEntry = async (
  entryPoint: string,
  projectRoot: string,
  includeDeepData: boolean
): Promise<HotspotAnalyzedRow> => {
  let result: BuildResult;
  let schemaExternalized = false;

  try {
    result = await buildHotspotEntry(entryPoint, false);
  } catch (error) {
    if (!shouldRetryWithSchemaExternalized(error)) {
      throw error;
    }
    result = await buildHotspotEntry(entryPoint, true);
    schemaExternalized = true;
  }

  const meta = result.metafile;
  if (!meta) {
    throw new Error(`No metafile generated for ${entryPoint}`);
  }

  const output = Object.values(meta.outputs as Record<string, MetaOutput>).at(
    0
  );
  if (!output) {
    throw new Error(`No output generated for ${entryPoint}`);
  }

  const inputEntries = Object.entries(meta.inputs as Record<string, MetaInput>);
  const totalInputBytes = inputEntries.reduce(
    (sum, [, value]) => sum + (value.bytes ?? 0),
    0
  );

  const isLocalInput = (inputPath: string): boolean =>
    inputPath.startsWith('convex/') ||
    inputPath.startsWith('example/convex/') ||
    inputPath.includes('/example/convex/');

  const localInputBytes = inputEntries
    .filter(([inputPath]) => isLocalInput(inputPath))
    .reduce((sum, [, value]) => sum + (value.bytes ?? 0), 0);

  const row: HotspotAnalyzedRow = {
    entry: path.relative(projectRoot, entryPoint),
    inputCount: inputEntries.length,
    localInputBytes,
    dependencyInputBytes: Math.max(0, totalInputBytes - localInputBytes),
    totalInputBytes,
    outputBytes: output.bytes,
    schemaExternalized,
  };

  if (!includeDeepData) {
    return row;
  }

  const bytesByInput = new Map(
    inputEntries.map(([inputPath, value]) => [inputPath, value.bytes ?? 0])
  );

  const outputInputs = Object.entries(output.inputs ?? {})
    .map(([inputPath, value]) => ({
      path: inputPath,
      bytesInOutput: value.bytesInOutput ?? 0,
      sourceBytes: bytesByInput.get(inputPath) ?? 0,
    }))
    .sort((a, b) => b.bytesInOutput - a.bytesInOutput);

  const inputSet = new Set(inputEntries.map(([inputPath]) => inputPath));
  const importsByInput = Object.fromEntries(
    inputEntries.map(([inputPath, value]) => [
      inputPath,
      Array.from(
        new Set(
          (value.imports ?? [])
            .map((entry) => entry.path)
            .filter(
              (importPath): importPath is string =>
                typeof importPath === 'string' && inputSet.has(importPath)
            )
        )
      ),
    ])
  );

  return {
    ...row,
    deep: {
      importsByInput,
      outputInputs,
    },
  };
};

const printHotspotTopInputs = (
  row: HotspotRow,
  options: AnalyzeOptions
): void => {
  if (!row.deep) return;

  const internalInputs = row.deep.outputInputs.filter(
    (input) => input.bytesInOutput > 0 && !isNodeModulesInputPath(input.path)
  );
  const externalBytes = row.deep.outputInputs
    .filter(
      (input) => input.bytesInOutput > 0 && isNodeModulesInputPath(input.path)
    )
    .reduce((sum, input) => sum + input.bytesInOutput, 0);

  const visibleInputs = internalInputs.filter(
    (input) =>
      !isSmallInput(input.bytesInOutput, row.outputBytes, options.showSmall)
  );

  const topInputs = visibleInputs.slice(0, options.topInputs);
  const hiddenInputs = internalInputs.filter((input) =>
    isSmallInput(input.bytesInOutput, row.outputBytes, options.showSmall)
  );
  const hiddenBytes = hiddenInputs.reduce(
    (sum, input) => sum + input.bytesInOutput,
    0
  );

  if (topInputs.length === 0) {
    if (!options.showSmall && hiddenInputs.length > 0) {
      console.log('');
      console.log(bold(`Top internal inputs: ${row.entry}`));
      console.log(
        dim(
          `(all visible internal inputs were small; hidden ${hiddenInputs.length} inputs / ${toMB(hiddenBytes)} MB)`
        )
      );
      if (externalBytes > 0) {
        console.log(
          dim(
            `External deps are summarized in Top packages (${toMB(externalBytes)} MB).`
          )
        );
      }
    }
    return;
  }

  console.log('');
  console.log(bold(`Top internal inputs: ${row.entry}`));
  const inputPathWidth = Math.max(18, outputWidth - 57);
  console.log(
    dim(
      `bytesInOutput  sourceBytes    share       impact  ${pad('path', inputPathWidth)}`
    )
  );
  console.log(
    dim(
      `-------------  ----------  ----------  ----------------  ${'-'.repeat(inputPathWidth)}`
    )
  );

  for (const input of topInputs) {
    const share =
      row.outputBytes > 0 ? (input.bytesInOutput / row.outputBytes) * 100 : 0;
    const bytesInOutput = input.bytesInOutput.toString().padStart(13);
    const sourceBytes = input.sourceBytes.toString().padStart(10);
    const sharePct = colorize(
      `${share.toFixed(2)}%`.padStart(10),
      shareColor(share)
    );
    const bar = makeShareBar(share);
    console.log(
      `${bytesInOutput}  ${sourceBytes}  ${sharePct}  ${bar}  ${compactPath(input.path, inputPathWidth)}`
    );
  }

  if (!options.showSmall && hiddenInputs.length > 0) {
    const share =
      row.outputBytes > 0 ? (hiddenBytes / row.outputBytes) * 100 : 0;
    const hiddenLabel = dim(`(small: ${hiddenInputs.length} hidden inputs)`);
    console.log(
      `${hiddenBytes.toString().padStart(13)}  ${''.padStart(10)}  ${colorize(
        `${share.toFixed(2)}%`.padStart(10),
        ANSI.gray
      )}  ${makeShareBar(share)}  ${hiddenLabel}`
    );
  }

  if (externalBytes > 0) {
    const share =
      row.outputBytes > 0 ? (externalBytes / row.outputBytes) * 100 : 0;
    console.log(
      dim(
        `External deps: ${toMB(externalBytes)} MB (${share.toFixed(2)}%), see Top packages.`
      )
    );
  }
};

const printHotspotPackages = (
  row: HotspotRow,
  options: AnalyzeOptions
): void => {
  if (!row.deep) return;

  const packageRows = buildPackageImportGraphRows(
    row,
    Number.POSITIVE_INFINITY
  );
  const visibleRows = packageRows.filter(
    (item) =>
      !isSmallInput(item.bytesInOutput, row.outputBytes, options.showSmall)
  );
  const hiddenRows = packageRows.filter((item) =>
    isSmallInput(item.bytesInOutput, row.outputBytes, options.showSmall)
  );
  const hiddenBytes = hiddenRows.reduce(
    (sum, item) => sum + item.bytesInOutput,
    0
  );
  const topRows = visibleRows.slice(0, options.topPackages);

  console.log('');
  console.log(bold(`Package graph: ${row.entry}`));

  if (topRows.length === 0) {
    console.log('  (no packages above small-dependency threshold)');
    return;
  }

  const packageColWidth = Math.max(16, Math.min(30, outputWidth - 58));
  const barWidth = Math.max(
    8,
    Math.min(16, outputWidth - (packageColWidth + 52))
  );

  for (const [index, item] of topRows.entries()) {
    const share =
      row.outputBytes > 0 ? (item.bytesInOutput / row.outputBytes) * 100 : 0;
    const shareStr = colorize(`${share.toFixed(2)}%`, shareColor(share));
    const sizeStr = colorize(
      `${toMB(item.bytesInOutput)} MB`,
      shareColor(share)
    );
    const bar = makeShareBar(share, barWidth);
    const packageLabel = truncate(item.packageName, packageColWidth);
    const targetPrefix = dim('   imports -> ');
    const maxTargetWidth = Math.max(
      18,
      outputWidth - visibleLength(targetPrefix) - 2
    );

    console.log(
      `${bold(`${index + 1}.`)} ${pad(packageLabel, packageColWidth)} ${pad(sizeStr, 18)} ${pad(shareStr, 10)} ${bar}`
    );
    if (item.topTargets.length > 0) {
      const targetLabel = item.topTargets.join(', ');
      console.log(`${targetPrefix}${truncate(targetLabel, maxTargetWidth)}`);
    }
  }

  if (!options.showSmall && hiddenRows.length > 0) {
    const share =
      row.outputBytes > 0 ? (hiddenBytes / row.outputBytes) * 100 : 0;
    console.log(
      `   ${dim(`(small packages hidden: ${hiddenRows.length}, ${toMB(hiddenBytes)} MB, ${share.toFixed(2)}%)`)}`
    );
  }
};

const shouldPromptForHotspotPick = (options: AnalyzeOptions): boolean => {
  if (options.interactive === 'never') {
    return false;
  }

  if (!isInteractiveTerminal) {
    return false;
  }

  if (options.details || options.entryPattern) {
    return false;
  }

  return options.interactive === 'always';
};

const HOTSPOT_SORT_ORDER: HotspotSortKey[] = ['out', 'dep', 'fns'];
const HOTSPOT_DETAIL_ORDER: HotspotDetailPane[] = [
  'handlers',
  'packages',
  'inputs',
];
const HOTSPOT_MIN_SPLIT_COLUMNS = 120;
const HOTSPOT_LEFT_MIN_WIDTH = 30;
const HOTSPOT_LEFT_MAX_WIDTH = 56;
const HOTSPOT_HEADER_LINES = 2;
const HOTSPOT_BOTTOM_LINES = 2;

type InteractiveLayout =
  | {
      mode: 'split';
      columns: number;
      rows: number;
      bodyHeight: number;
      leftWidth: number;
      rightWidth: number;
      listViewportHeight: number;
      detailViewportHeight: number;
    }
  | {
      mode: 'stacked';
      columns: number;
      rows: number;
      bodyHeight: number;
      listHeight: number;
      detailHeight: number;
      listViewportHeight: number;
      detailViewportHeight: number;
    };

type InteractiveState = {
  selectedIndex: number;
  topIndex: number;
  filterQuery: string;
  sortKey: HotspotSortKey;
  detailPane: HotspotDetailPane;
  includeGenerated: boolean;
  watchEnabled: boolean;
  showHelp: boolean;
  statusMessage: string;
};

type InteractiveAction =
  | { type: 'moveSelection'; delta: number; rowCount: number }
  | { type: 'setFilter'; query: string }
  | { type: 'cycleSort' }
  | { type: 'cyclePane'; direction: 1 | -1 }
  | { type: 'toggleGenerated' }
  | { type: 'toggleWatch' }
  | { type: 'toggleHelp' }
  | { type: 'requestRefresh' }
  | { type: 'setStatus'; message: string }
  | { type: 'setTopIndex'; topIndex: number };

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const cycleHotspotSort = (sortKey: HotspotSortKey): HotspotSortKey => {
  const currentIndex = HOTSPOT_SORT_ORDER.indexOf(sortKey);
  return HOTSPOT_SORT_ORDER[(currentIndex + 1) % HOTSPOT_SORT_ORDER.length];
};

const cycleHotspotDetailPane = (
  detailPane: HotspotDetailPane
): HotspotDetailPane => {
  const currentIndex = HOTSPOT_DETAIL_ORDER.indexOf(detailPane);
  return HOTSPOT_DETAIL_ORDER[(currentIndex + 1) % HOTSPOT_DETAIL_ORDER.length];
};

const cycleHotspotDetailPaneBackward = (
  detailPane: HotspotDetailPane
): HotspotDetailPane => {
  const currentIndex = HOTSPOT_DETAIL_ORDER.indexOf(detailPane);
  const nextIndex =
    (currentIndex - 1 + HOTSPOT_DETAIL_ORDER.length) %
    HOTSPOT_DETAIL_ORDER.length;
  return HOTSPOT_DETAIL_ORDER[nextIndex];
};

const fitListViewport = (
  totalRows: number,
  selectedIndex: number,
  viewportHeight: number,
  topIndex: number
): number => {
  if (totalRows <= 0 || viewportHeight <= 0) {
    return 0;
  }

  const maxTop = Math.max(0, totalRows - viewportHeight);
  const clampedSelected = clampNumber(selectedIndex, 0, totalRows - 1);
  let nextTop = clampNumber(topIndex, 0, maxTop);

  if (clampedSelected < nextTop) {
    nextTop = clampedSelected;
  } else if (clampedSelected >= nextTop + viewportHeight) {
    nextTop = clampedSelected - viewportHeight + 1;
  }

  return clampNumber(nextTop, 0, maxTop);
};

const pickSelectedIndex = (
  rows: HotspotRow[],
  preferredEntry: string | null,
  fallbackIndex: number
): number => {
  if (rows.length === 0) {
    return 0;
  }

  if (preferredEntry) {
    const preferredIndex = rows.findIndex(
      (row) => row.entry === preferredEntry
    );
    if (preferredIndex >= 0) {
      return preferredIndex;
    }
  }

  return clampNumber(fallbackIndex, 0, rows.length - 1);
};

const resolveInteractiveLayout = (
  columns: number,
  rows: number
): InteractiveLayout => {
  const safeColumns = Math.max(60, columns);
  const safeRows = Math.max(12, rows);
  const bodyHeight = Math.max(
    6,
    safeRows - HOTSPOT_HEADER_LINES - HOTSPOT_BOTTOM_LINES
  );

  if (safeColumns >= HOTSPOT_MIN_SPLIT_COLUMNS) {
    const leftWidth = clampNumber(
      Math.floor(safeColumns * 0.33),
      HOTSPOT_LEFT_MIN_WIDTH,
      HOTSPOT_LEFT_MAX_WIDTH
    );
    const rightWidth = Math.max(24, safeColumns - leftWidth - 3);
    const viewportHeight = Math.max(1, bodyHeight - 1);

    return {
      mode: 'split',
      columns: safeColumns,
      rows: safeRows,
      bodyHeight,
      leftWidth,
      rightWidth,
      listViewportHeight: viewportHeight,
      detailViewportHeight: viewportHeight,
    };
  }

  const stackBody = Math.max(5, bodyHeight);
  const listHeight = Math.max(2, Math.floor((stackBody - 1) * 0.45));
  let detailHeight = Math.max(2, stackBody - listHeight - 1);
  if (listHeight + detailHeight + 1 > stackBody) {
    detailHeight = Math.max(2, stackBody - listHeight - 1);
  }

  return {
    mode: 'stacked',
    columns: safeColumns,
    rows: safeRows,
    bodyHeight: stackBody,
    listHeight,
    detailHeight,
    listViewportHeight: Math.max(1, listHeight - 1),
    detailViewportHeight: Math.max(1, detailHeight - 1),
  };
};

const reduceInteractiveState = (
  state: InteractiveState,
  action: InteractiveAction
): InteractiveState => {
  switch (action.type) {
    case 'moveSelection': {
      if (action.rowCount <= 0) {
        return { ...state, selectedIndex: 0, topIndex: 0 };
      }
      const nextIndex = clampNumber(
        state.selectedIndex + action.delta,
        0,
        action.rowCount - 1
      );
      return { ...state, selectedIndex: nextIndex };
    }
    case 'setFilter':
      return { ...state, filterQuery: action.query };
    case 'cycleSort':
      return { ...state, sortKey: cycleHotspotSort(state.sortKey) };
    case 'cyclePane':
      return {
        ...state,
        detailPane:
          action.direction === 1
            ? cycleHotspotDetailPane(state.detailPane)
            : cycleHotspotDetailPaneBackward(state.detailPane),
      };
    case 'toggleGenerated':
      return { ...state, includeGenerated: !state.includeGenerated };
    case 'toggleWatch':
      return { ...state, watchEnabled: !state.watchEnabled };
    case 'toggleHelp':
      return { ...state, showHelp: !state.showHelp };
    case 'requestRefresh':
      return { ...state, statusMessage: 'Refreshing analysis...' };
    case 'setStatus':
      return { ...state, statusMessage: action.message };
    case 'setTopIndex':
      return { ...state, topIndex: action.topIndex };
    default:
      return state;
  }
};

const sortHotspotRows = (
  rows: HotspotRow[],
  sortKey: HotspotSortKey
): HotspotRow[] => {
  const clone = [...rows];
  if (sortKey === 'dep') {
    clone.sort((a, b) => b.dependencyInputBytes - a.dependencyInputBytes);
    return clone;
  }
  if (sortKey === 'fns') {
    clone.sort((a, b) => b.handlerExports.length - a.handlerExports.length);
    return clone;
  }
  clone.sort((a, b) => b.outputBytes - a.outputBytes);
  return clone;
};

const filterHotspotRows = (rows: HotspotRow[], query: string): HotspotRow[] => {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return rows;
  }
  return rows.filter((row) => {
    if (row.entry.toLowerCase().includes(trimmed)) {
      return true;
    }
    return row.handlerExports.some((name) =>
      name.toLowerCase().includes(trimmed)
    );
  });
};

const sortLabel = (sortKey: HotspotSortKey): string => {
  if (sortKey === 'dep') return 'DepMB';
  if (sortKey === 'fns') return 'Fns';
  return 'OutMB';
};

const selectHotspotEntryPoints = (params: {
  baseCandidateEntries: string[];
  allCandidateEntries: string[];
  handlerExportsByEntry: Map<string, string[]>;
  includeGenerated: boolean;
}): {
  isolateEntries: string[];
  generatedEntries: string[];
  entryPoints: string[];
} => {
  const {
    baseCandidateEntries,
    allCandidateEntries,
    handlerExportsByEntry,
    includeGenerated,
  } = params;

  const isolateEntries = baseCandidateEntries.filter((entryPoint) =>
    handlerExportsByEntry.has(entryPoint)
  );

  const baseEntrySet = new Set(baseCandidateEntries);
  const ignoredEntries = allCandidateEntries.filter(
    (entryPoint) => !baseEntrySet.has(entryPoint)
  );
  const generatedEntries = includeGenerated
    ? ignoredEntries
    : ignoredEntries.filter((entryPoint) =>
        handlerExportsByEntry.has(entryPoint)
      );

  return {
    isolateEntries,
    generatedEntries,
    entryPoints: dedupe([...isolateEntries, ...generatedEntries]),
  };
};

const filterEntryPointsByPattern = (
  entryPoints: string[],
  roots: ProjectRoots,
  entryPattern: string | null
): string[] => {
  if (!entryPattern) {
    return entryPoints;
  }

  let regex: RegExp;
  try {
    regex = new RegExp(entryPattern, 'i');
  } catch (error) {
    const reason =
      error instanceof Error ? firstLine(error.message) : 'invalid regex';
    throw new Error(`Invalid entry regex "${entryPattern}": ${reason}`);
  }

  return entryPoints.filter((entryPoint) =>
    regex.test(path.relative(roots.projectRoot, entryPoint))
  );
};

const collectAnalyzeEntrySelection = async (
  roots: ProjectRoots,
  options: AnalyzeOptions
): Promise<AnalyzeEntrySelection> => {
  const allCandidateWithNode = walkDeployEntryPoints(roots.functionsRoot, {
    includeMultiDot: true,
    includeGeneratedDir: true,
  });
  const nodeEntryPoints = allCandidateWithNode.filter((entryPoint) =>
    isNodeEntryPoint(entryPoint, roots.functionsRoot)
  );
  const nodeEntrySet = new Set(nodeEntryPoints);

  const allCandidateEntries = allCandidateWithNode.filter(
    (entryPoint) => !nodeEntrySet.has(entryPoint)
  );
  const baseCandidateEntries = walkDeployEntryPoints(
    roots.functionsRoot
  ).filter((entryPoint) => !nodeEntrySet.has(entryPoint));

  const handlerExportsByEntry =
    await scanHandlerExportsByEntry(allCandidateEntries);
  const { isolateEntries, generatedEntries, entryPoints } =
    selectHotspotEntryPoints({
      baseCandidateEntries,
      allCandidateEntries,
      handlerExportsByEntry,
      includeGenerated: options.includeGenerated,
    });

  return {
    nodeEntryPoints,
    isolateEntries,
    generatedEntries,
    entryPoints: filterEntryPointsByPattern(
      entryPoints,
      roots,
      options.entryPattern
    ),
    handlerExportsByEntry,
  };
};

const collectHotspotRows = async (
  roots: ProjectRoots,
  options: AnalyzeOptions,
  includeDeepData: boolean
): Promise<HotspotCollection> => {
  const {
    isolateEntries,
    generatedEntries,
    entryPoints,
    handlerExportsByEntry,
  } = await collectAnalyzeEntrySelection(roots, options);

  const rows: Array<HotspotRow | FailedRow> = [];
  for (const entryPoint of entryPoints) {
    try {
      rows.push({
        ...(await analyzeHotspotEntry(
          entryPoint,
          roots.projectRoot,
          includeDeepData
        )),
        handlerExports: handlerExportsByEntry.get(entryPoint) ?? [],
      });
    } catch (error) {
      rows.push({
        entry: path.relative(roots.projectRoot, entryPoint),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    isolateEntries,
    generatedEntries,
    entryPoints,
    successRows: rows
      .filter((row): row is HotspotRow => !('error' in row))
      .sort((a, b) => b.outputBytes - a.outputBytes),
    failedRows: rows.filter((row): row is FailedRow => 'error' in row),
    handlerExportsByEntry,
  };
};

type PackageImportGraphRow = {
  packageName: string;
  bytesInOutput: number;
  topTargets: string[];
};

const buildPackageImportGraphRows = (
  row: HotspotRow,
  limit = 12
): PackageImportGraphRow[] => {
  if (!row.deep) {
    return [];
  }

  const packageBytes = new Map<string, number>();
  const packageTargets = new Map<string, Map<string, number>>();

  for (const input of row.deep.outputInputs) {
    if (input.bytesInOutput <= 0) {
      continue;
    }

    const sourcePackage = packageFromInputPath(input.path);
    packageBytes.set(
      sourcePackage,
      (packageBytes.get(sourcePackage) ?? 0) + input.bytesInOutput
    );

    const targets = row.deep.importsByInput[input.path] ?? [];
    if (targets.length === 0) {
      continue;
    }

    const targetCounts =
      packageTargets.get(sourcePackage) ?? new Map<string, number>();
    for (const targetPath of targets) {
      const targetPackage = packageFromInputPath(targetPath);
      if (targetPackage === sourcePackage) {
        continue;
      }
      targetCounts.set(
        targetPackage,
        (targetCounts.get(targetPackage) ?? 0) + 1
      );
    }
    packageTargets.set(sourcePackage, targetCounts);
  }

  const sorted = Array.from(packageBytes.entries())
    .map(([packageName, bytesInOutput]) => {
      const targetMap =
        packageTargets.get(packageName) ?? new Map<string, number>();
      const topTargets = Array.from(targetMap.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([target]) => target);
      return {
        packageName,
        bytesInOutput,
        topTargets,
      };
    })
    .sort((a, b) => b.bytesInOutput - a.bytesInOutput);

  if (!Number.isFinite(limit)) {
    return sorted;
  }
  return sorted.slice(0, limit);
};

const padVisible = (value: string, width: number): string => {
  const missing = width - visibleLength(value);
  if (missing <= 0) {
    return value;
  }
  return `${value}${' '.repeat(missing)}`;
};

const fillPane = (lines: string[], height: number): string[] => {
  const next = [...lines];
  while (next.length < height) {
    next.push('');
  }
  return next.slice(0, height);
};

const buildHandlersPaneLines = (
  row: HotspotRow | null,
  width: number
): string[] => {
  if (!row) {
    return [dim('No selected entry.')];
  }
  if (row.handlerExports.length === 0) {
    return [dim('No handler exports detected.')];
  }
  return row.handlerExports.map((name) => `- ${truncate(name, width - 2)}`);
};

const buildPackagesPaneLines = (
  row: HotspotRow | null,
  options: AnalyzeOptions,
  width: number
): string[] => {
  if (!row) {
    return [dim('No selected entry.')];
  }
  if (!row.deep) {
    return [dim('No package data loaded.')];
  }

  const packageRows = buildPackageImportGraphRows(
    row,
    Number.POSITIVE_INFINITY
  );
  const visibleRows = packageRows.filter(
    (item) =>
      !isSmallInput(item.bytesInOutput, row.outputBytes, options.showSmall)
  );
  const hiddenCount = packageRows.length - visibleRows.length;
  const lines: string[] = [];

  if (visibleRows.length === 0) {
    lines.push(dim('No package rows above small-input threshold.'));
    return lines;
  }

  const topRows = visibleRows.slice(0, Math.min(12, options.topPackages));
  const packageWidth = Math.max(10, width - 26);
  for (const [index, pkg] of topRows.entries()) {
    const share =
      row.outputBytes > 0 ? (pkg.bytesInOutput / row.outputBytes) * 100 : 0;
    lines.push(
      `${pad(String(index + 1), 2, 'right')} ${pad(
        truncate(pkg.packageName, packageWidth),
        packageWidth
      )} ${pad(`${toMB(pkg.bytesInOutput)}MB`, 9, 'right')} ${pad(
        `${share.toFixed(2)}%`,
        8,
        'right'
      )}`
    );
    if (pkg.topTargets.length > 0) {
      const targetLabel = pkg.topTargets.join(', ');
      lines.push(
        dim(`   -> ${truncate(targetLabel, Math.max(12, width - 7))}`)
      );
    }
  }

  if (!options.showSmall && hiddenCount > 0) {
    lines.push(dim(`hidden small packages: ${hiddenCount}`));
  }

  return lines;
};

const buildInputsPaneLines = (
  row: HotspotRow | null,
  options: AnalyzeOptions,
  width: number
): string[] => {
  if (!row) {
    return [dim('No selected entry.')];
  }
  if (!row.deep) {
    return [dim('No input data loaded.')];
  }

  const internal = row.deep.outputInputs.filter(
    (input) => input.bytesInOutput > 0 && !isNodeModulesInputPath(input.path)
  );
  const externalBytes = row.deep.outputInputs
    .filter(
      (input) => input.bytesInOutput > 0 && isNodeModulesInputPath(input.path)
    )
    .reduce((sum, input) => sum + input.bytesInOutput, 0);
  const visibleInputs = internal
    .filter(
      (input) =>
        !isSmallInput(input.bytesInOutput, row.outputBytes, options.showSmall)
    )
    .slice(0, Math.min(12, options.topInputs));

  if (visibleInputs.length === 0) {
    const lines = [dim('No internal inputs above small-input threshold.')];
    if (externalBytes > 0) {
      const share =
        row.outputBytes > 0 ? (externalBytes / row.outputBytes) * 100 : 0;
      lines.push(
        dim(`external deps: ${toMB(externalBytes)}MB (${share.toFixed(2)}%)`)
      );
    }
    return lines;
  }

  const pathWidth = Math.max(12, width - 24);
  const lines = visibleInputs.map((input) => {
    const share =
      row.outputBytes > 0 ? (input.bytesInOutput / row.outputBytes) * 100 : 0;
    return `${pad(`${toMB(input.bytesInOutput)}MB`, 9, 'right')} ${pad(
      `${share.toFixed(2)}%`,
      8,
      'right'
    )} ${truncate(shortPath(input.path), pathWidth)}`;
  });

  if (externalBytes > 0) {
    const share =
      row.outputBytes > 0 ? (externalBytes / row.outputBytes) * 100 : 0;
    lines.push(
      dim(`external deps: ${toMB(externalBytes)}MB (${share.toFixed(2)}%)`)
    );
  }

  return lines;
};

const buildHelpPaneLines = (): string[] => [
  'j/k move selection',
  'left/right arrow cycle detail pane',
  '/ filter entries',
  's sort cycle (OutMB, DepMB, Fns)',
  'g toggle all entries',
  'r refresh analysis',
  'w toggle watch mode',
  '? toggle help overlay',
  'q quit',
];

const runHotspotInteractive = async (
  roots: ProjectRoots,
  options: AnalyzeOptions
): Promise<number> => {
  const stdin = process.stdin;
  const stdout = process.stdout;

  let state: InteractiveState = {
    selectedIndex: 0,
    topIndex: 0,
    filterQuery: '',
    sortKey: 'out',
    detailPane: 'packages',
    includeGenerated: options.includeGenerated,
    watchEnabled: false,
    showHelp: false,
    statusMessage: '',
  };

  let snapshot = await collectHotspotRows(
    roots,
    {
      ...options,
      includeGenerated: state.includeGenerated,
      entryPattern: null,
    },
    false
  );
  let visibleRows = sortHotspotRows(
    filterHotspotRows(snapshot.successRows, state.filterQuery),
    state.sortKey
  );
  let watcher: ReturnType<typeof fs.watch> | null = null;
  let watchTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshing = false;
  let refreshQueued = false;
  let shouldQuit = false;
  let listViewportHeight = 10;
  const deepRowCache = new Map<string, HotspotRow | null>();

  const getSelectedEntry = (): string | null =>
    visibleRows.at(state.selectedIndex)?.entry ?? null;

  const findRowByEntry = (entry: string | null): HotspotRow | null => {
    if (!entry) return null;
    return snapshot.successRows.find((row) => row.entry === entry) ?? null;
  };

  const syncVisibleRows = (preferredEntry: string | null): void => {
    visibleRows = sortHotspotRows(
      filterHotspotRows(snapshot.successRows, state.filterQuery),
      state.sortKey
    );
    const nextSelectedIndex = pickSelectedIndex(
      visibleRows,
      preferredEntry,
      state.selectedIndex
    );
    const nextTopIndex = fitListViewport(
      visibleRows.length,
      nextSelectedIndex,
      listViewportHeight,
      state.topIndex
    );
    state = reduceInteractiveState(state, {
      type: 'setTopIndex',
      topIndex: nextTopIndex,
    });
    state = { ...state, selectedIndex: nextSelectedIndex };
  };

  const refreshSnapshot = async (reason: string): Promise<void> => {
    if (refreshing) {
      refreshQueued = true;
      return;
    }
    refreshing = true;
    state = reduceInteractiveState(state, {
      type: 'setStatus',
      message: reason,
    });
    const preferredEntry = getSelectedEntry();

    try {
      snapshot = await collectHotspotRows(
        roots,
        {
          ...options,
          includeGenerated: state.includeGenerated,
          entryPattern: null,
        },
        false
      );
      deepRowCache.clear();
      syncVisibleRows(preferredEntry);
      state = reduceInteractiveState(state, {
        type: 'setStatus',
        message: `Refreshed (${snapshot.successRows.length} entries).`,
      });
    } catch (error) {
      state = reduceInteractiveState(state, {
        type: 'setStatus',
        message: `Refresh failed: ${firstLine(
          error instanceof Error ? error.message : String(error)
        )}`,
      });
    } finally {
      refreshing = false;
      if (refreshQueued) {
        refreshQueued = false;
        await refreshSnapshot('Refreshing (queued)...');
      }
    }
  };

  const stopWatcher = (): void => {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    if (watchTimer) {
      clearTimeout(watchTimer);
      watchTimer = null;
    }
  };

  const applyWatchMode = (): void => {
    if (!state.watchEnabled) {
      stopWatcher();
      state = reduceInteractiveState(state, {
        type: 'setStatus',
        message: 'Watch mode disabled.',
      });
      return;
    }

    try {
      watcher = fs.watch(roots.functionsRoot, { recursive: true }, () => {
        if (watchTimer) {
          clearTimeout(watchTimer);
        }
        watchTimer = setTimeout(() => {
          void refreshSnapshot('Auto-refresh (file change)...');
        }, 200);
      });
      state = reduceInteractiveState(state, {
        type: 'setStatus',
        message: 'Watch mode enabled.',
      });
    } catch (error) {
      state = reduceInteractiveState(state, { type: 'toggleWatch' });
      state = reduceInteractiveState(state, {
        type: 'setStatus',
        message: `Watch unavailable: ${firstLine(
          error instanceof Error ? error.message : String(error)
        )}`,
      });
    }
  };

  const promptFilter = async (): Promise<void> => {
    if (typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(false);
    }
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const value = await rl.question('Filter entries (empty clears): ');
      const preferredEntry = getSelectedEntry();
      state = reduceInteractiveState(state, {
        type: 'setFilter',
        query: value.trim(),
      });
      syncVisibleRows(preferredEntry);
      state = reduceInteractiveState(state, {
        type: 'setStatus',
        message: state.filterQuery
          ? `Filter applied: "${state.filterQuery}"`
          : 'Filter cleared.',
      });
    } finally {
      rl.close();
      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(true);
      }
      stdin.resume();
      stdin.setEncoding('utf8');
    }
  };

  const ensureDeepRow = async (entry: string): Promise<HotspotRow | null> => {
    if (deepRowCache.has(entry)) {
      return deepRowCache.get(entry) ?? null;
    }

    const entryPoint = path.join(roots.projectRoot, entry);
    try {
      const analyzed = await analyzeHotspotEntry(
        entryPoint,
        roots.projectRoot,
        true
      );
      const fallbackHandlers = findRowByEntry(entry)?.handlerExports ?? [];
      const mergedRow: HotspotRow = {
        ...analyzed,
        handlerExports:
          snapshot.handlerExportsByEntry.get(entryPoint) ?? fallbackHandlers,
      };
      deepRowCache.set(entry, mergedRow);
      return mergedRow;
    } catch (error) {
      deepRowCache.set(entry, null);
      state = reduceInteractiveState(state, {
        type: 'setStatus',
        message: `Detail load failed for ${entry}: ${firstLine(
          error instanceof Error ? error.message : String(error)
        )}`,
      });
      return null;
    }
  };

  const renderInteractive = async (): Promise<void> => {
    const layout = resolveInteractiveLayout(
      stdout.columns ?? outputWidth,
      stdout.rows ?? 30
    );
    listViewportHeight = layout.listViewportHeight;
    state = reduceInteractiveState(state, {
      type: 'setTopIndex',
      topIndex: fitListViewport(
        visibleRows.length,
        state.selectedIndex,
        layout.listViewportHeight,
        state.topIndex
      ),
    });

    const selectedRow = visibleRows.at(state.selectedIndex) ?? null;
    const activeEntry = selectedRow?.entry ?? null;
    let detailRow = findRowByEntry(activeEntry);

    if (!state.showHelp && activeEntry && state.detailPane !== 'handlers') {
      detailRow = await ensureDeepRow(activeEntry);
    }

    const statusLine = state.statusMessage || 'Ready';
    const headerLine = `entries=${visibleRows.length}/${snapshot.successRows.length} sort=${sortLabel(
      state.sortKey
    )} filter=${state.filterQuery || '∅'} all=${
      state.includeGenerated ? 'on' : 'off'
    } pane=${state.detailPane} watch=${state.watchEnabled ? 'on' : 'off'}`;

    const listLines = (() => {
      const lines: string[] = [
        bold(
          truncate(
            `Entries (${visibleRows.length})${state.filterQuery ? ` · filter="${state.filterQuery}"` : ''}`,
            layout.mode === 'split' ? layout.leftWidth : layout.columns
          )
        ),
      ];

      if (visibleRows.length === 0) {
        lines.push(dim('No entries. Adjust filter or refresh.'));
      } else {
        const start = state.topIndex;
        const end = Math.min(
          visibleRows.length,
          start + layout.listViewportHeight
        );
        const labelWidth =
          (layout.mode === 'split' ? layout.leftWidth : layout.columns) - 4;
        for (let i = start; i < end; i += 1) {
          const row = visibleRows[i];
          const marker =
            i === state.selectedIndex ? colorize('›', ANSI.cyan) : ' ';
          const label = truncate(
            `${row.entry} · ${toMB(row.outputBytes)}MB · ${row.handlerExports.length} fn`,
            Math.max(16, labelWidth)
          );
          lines.push(`${marker} ${label}`);
        }
      }

      return lines;
    })();

    const detailTitle = `Detail (${state.detailPane}) · ${
      state.showHelp ? 'help' : activeEntry ? activeEntry : 'none'
    }`;
    const detailBodyWidth =
      (layout.mode === 'split' ? layout.rightWidth : layout.columns) - 1;
    const detailBody = state.showHelp
      ? buildHelpPaneLines()
      : state.detailPane === 'handlers'
        ? buildHandlersPaneLines(detailRow, detailBodyWidth)
        : state.detailPane === 'packages'
          ? buildPackagesPaneLines(detailRow, options, detailBodyWidth)
          : buildInputsPaneLines(detailRow, options, detailBodyWidth);
    const detailLines = [
      bold(truncate(detailTitle, detailBodyWidth)),
      ...detailBody,
    ];

    const keyHints =
      'j/k move  ←/→ pane  / filter  s sort  g all  r refresh  w watch  ? help  q quit';

    stdout.write('\x1b[2J\x1b[H');
    console.log(bold('better-convex analyze · interactive'));
    console.log(dim(truncate(headerLine, layout.columns)));

    if (layout.mode === 'split') {
      const leftPane = fillPane(listLines, layout.bodyHeight);
      const rightPane = fillPane(detailLines, layout.bodyHeight);
      for (let i = 0; i < layout.bodyHeight; i += 1) {
        const left = padVisible(
          truncate(leftPane[i] ?? '', layout.leftWidth),
          layout.leftWidth
        );
        const right = truncate(rightPane[i] ?? '', layout.rightWidth);
        console.log(`${left} │ ${right}`);
      }
    } else {
      const listPane = fillPane(listLines, layout.listHeight);
      const detailPane = fillPane(detailLines, layout.detailHeight);
      for (const line of listPane) {
        console.log(truncate(line, layout.columns));
      }
      console.log(dim('-'.repeat(layout.columns)));
      for (const line of detailPane) {
        console.log(truncate(line, layout.columns));
      }
    }

    console.log(dim(truncate(keyHints, layout.columns)));
    console.log(dim(truncate(statusLine, layout.columns)));
  };

  const readKey = (): Promise<string> =>
    new Promise((resolve) => {
      stdin.once('data', (data) => resolve(String(data)));
    });

  syncVisibleRows(null);

  if (typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(true);
  }
  stdin.resume();
  stdin.setEncoding('utf8');

  try {
    while (!shouldQuit) {
      await renderInteractive();
      const key = await readKey();

      if (key === '\u0003' || key === 'q') {
        shouldQuit = true;
        continue;
      }
      if (key === 'j' || key === '\u001b[B') {
        state = reduceInteractiveState(state, {
          type: 'moveSelection',
          delta: 1,
          rowCount: visibleRows.length,
        });
        continue;
      }
      if (key === 'k' || key === '\u001b[A') {
        state = reduceInteractiveState(state, {
          type: 'moveSelection',
          delta: -1,
          rowCount: visibleRows.length,
        });
        continue;
      }
      if (key === '/') {
        await promptFilter();
        continue;
      }
      if (key === 's') {
        const preferredEntry = getSelectedEntry();
        state = reduceInteractiveState(state, { type: 'cycleSort' });
        syncVisibleRows(preferredEntry);
        state = reduceInteractiveState(state, {
          type: 'setStatus',
          message: `Sort: ${sortLabel(state.sortKey)}`,
        });
        continue;
      }
      if (key === 'g') {
        state = reduceInteractiveState(state, { type: 'toggleGenerated' });
        await refreshSnapshot(
          state.includeGenerated
            ? 'Refreshing with all entries...'
            : 'Refreshing with function entries only...'
        );
        continue;
      }
      if (key === '\u001b[C') {
        state = reduceInteractiveState(state, {
          type: 'cyclePane',
          direction: 1,
        });
        state = reduceInteractiveState(state, {
          type: 'setStatus',
          message: `Detail pane: ${state.detailPane}`,
        });
        continue;
      }
      if (key === '\u001b[D') {
        state = reduceInteractiveState(state, {
          type: 'cyclePane',
          direction: -1,
        });
        state = reduceInteractiveState(state, {
          type: 'setStatus',
          message: `Detail pane: ${state.detailPane}`,
        });
        continue;
      }
      if (key === 'r') {
        state = reduceInteractiveState(state, { type: 'requestRefresh' });
        await refreshSnapshot(state.statusMessage);
        continue;
      }
      if (key === 'w') {
        state = reduceInteractiveState(state, { type: 'toggleWatch' });
        applyWatchMode();
        continue;
      }
      if (key === '?') {
        state = reduceInteractiveState(state, { type: 'toggleHelp' });
      }
    }
  } finally {
    stopWatcher();
    if (typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(false);
    }
    stdin.pause();
    stdout.write('\x1b[2J\x1b[H');
  }

  return 0;
};

const runHotspotAnalysis = async (
  roots: ProjectRoots,
  options: AnalyzeOptions
): Promise<number> => {
  if (shouldPromptForHotspotPick(options)) {
    return runHotspotInteractive(roots, options);
  }

  const includeDeepData = options.details;
  const {
    isolateEntries,
    generatedEntries,
    entryPoints,
    successRows,
    failedRows,
  } = await collectHotspotRows(roots, options, includeDeepData);

  if (entryPoints.length === 0) {
    if (options.includeGenerated) {
      console.log('No matching entries found for the provided regex.');
    } else {
      console.log(
        'No matching Convex handler entries found (files exporting query/mutation/action, including internal variants).'
      );
    }
    return 0;
  }

  const outputTotal = successRows.reduce(
    (sum, row) => sum + row.outputBytes,
    0
  );
  const outputAverage =
    successRows.length > 0 ? outputTotal / successRows.length : 0;
  const totalHandlers = successRows.reduce(
    (sum, row) => sum + row.handlerExports.length,
    0
  );
  const largest = successRows.at(0);

  const buildHotspotDetailCommand = (
    entry: string,
    mode: 'agent' | 'human'
  ): string => {
    const exactEntryRegex = `^${escapeRegex(entry)}$`;
    const parts = [
      'better-convex',
      'analyze',
      shellQuote(exactEntryRegex),
      '--details',
    ];
    if (options.showInputs) {
      parts.push('--input');
    }
    if (options.includeGenerated) {
      parts.push('--all');
    }
    if (options.detailEntries !== DEFAULT_DETAIL_ENTRIES) {
      parts.push('--top', String(options.detailEntries));
    }
    if (mode === 'agent') {
      parts.push('--top-inputs', '30', '--top-packages', '20');
    }
    return parts.join(' ');
  };

  const actionRows = successRows;
  console.log(bold('Runtime hotspot analysis (least optimized functions)'));
  console.log(
    `isolateEntries=${isolateEntries.length} handlers=${totalHandlers} extraAll=${generatedEntries.length} selected=${entryPoints.length} ok=${successRows.length} failed=${failedRows.length} avg=${formatBytes(
      outputAverage
    )}${largest ? ` largest=${largest.entry} (${formatBytes(largest.outputBytes)})` : ''}`
  );
  console.log('');

  if (actionRows.length > 0) {
    console.log(bold('Agent queue (run top-down):'));
    for (const [index, row] of actionRows.entries()) {
      console.log(
        `${index + 1}. ${row.entry} (${toMB(row.outputBytes)} MB, ${row.handlerExports.length} handlers) -> ${buildHotspotDetailCommand(row.entry, 'agent')}`
      );
    }

    if (options.interactive === 'always' && !isInteractiveTerminal) {
      console.log('');
      console.log(
        dim('Interactive picker requires a TTY. Falling back to command list.')
      );
    }
    console.log('');
  }

  if (successRows.length > 0) {
    const fixedColumnsWidth = 4 + 7 + 7 + 7 + 7 + 6 + 4;
    const separatorWidth = 2 * 7;
    const maxEntryWidth = Math.max(
      16,
      outputWidth - fixedColumnsWidth - separatorWidth
    );
    const widths = {
      rank: 4,
      sev: 7,
      output: 7,
      deps: 7,
      local: 7,
      inputCount: 6,
      handlerCount: 4,
      entry: Math.max(
        16,
        Math.min(
          maxEntryWidth,
          Math.max(
            ...successRows.map((row) => row.entry.length),
            'Entry'.length
          )
        )
      ),
    };

    const header = [
      pad('Rank', widths.rank, 'right'),
      pad('Level', widths.sev),
      pad('OutMB', widths.output, 'right'),
      pad('DepMB', widths.deps, 'right'),
      pad('LocMB', widths.local, 'right'),
      pad('Files', widths.inputCount, 'right'),
      pad('Fns', widths.handlerCount, 'right'),
      pad('Entry', widths.entry),
    ].join('  ');

    const divider = [
      '-'.repeat(widths.rank),
      '-'.repeat(widths.sev),
      '-'.repeat(widths.output),
      '-'.repeat(widths.deps),
      '-'.repeat(widths.local),
      '-'.repeat(widths.inputCount),
      '-'.repeat(widths.handlerCount),
      '-'.repeat(widths.entry),
    ].join('  ');

    console.log(dim(header));
    console.log(dim(divider));

    for (const [index, row] of successRows.entries()) {
      const severity = severityForBytes(row.outputBytes, options);
      const outputMbValue = Number.parseFloat(toMB(row.outputBytes));
      console.log(
        [
          pad(String(index + 1), widths.rank, 'right'),
          colorizePadded(severity, widths.sev, 'left', severityColor(severity)),
          colorizePadded(
            toMB(row.outputBytes),
            widths.output,
            'right',
            shareColor((outputMbValue / options.dangerMb) * 100)
          ),
          pad(toMB(row.dependencyInputBytes), widths.deps, 'right'),
          pad(toMB(row.localInputBytes), widths.local, 'right'),
          pad(String(row.inputCount), widths.inputCount, 'right'),
          pad(String(row.handlerExports.length), widths.handlerCount, 'right'),
          pad(truncate(row.entry, widths.entry), widths.entry),
        ].join('  ')
      );
    }
  }

  if (failedRows.length > 0) {
    console.log(`\n${colorize('Failed entries:', ANSI.red)}`);
    for (const row of failedRows) {
      const errorLine = firstLine(row.error);
      const available = Math.max(24, outputWidth - row.entry.length - 4);
      console.log(`- ${row.entry}: ${truncate(errorLine, available)}`);
    }
  }

  if (includeDeepData) {
    const detailRows = options.entryPattern
      ? successRows
      : successRows.slice(0, options.detailEntries);

    if (!options.entryPattern && successRows.length > detailRows.length) {
      console.log('');
      console.log(
        dim(
          `Expanded details for top ${detailRows.length} entries. Pass an entry regex as first arg for a specific module.`
        )
      );
    }

    for (const row of detailRows) {
      if (row.handlerExports.length > 0) {
        console.log('');
        printWrapped({
          prefix: `${bold('Handlers:')} `,
          text: row.handlerExports.join(', '),
        });
      }
      printHotspotPackages(row, options);
      if (options.showInputs) {
        printHotspotTopInputs(row, options);
      }
    }
  }

  let exitCode = 0;
  if (failedRows.length > 0) {
    exitCode = 1;
  }

  if (
    options.failMb !== null &&
    largest &&
    largest.outputBytes / MB >= options.failMb
  ) {
    console.log('');
    console.log(
      colorize(
        `Fail threshold reached: largest output is ${toMB(largest.outputBytes)} MB (>= ${options.failMb.toFixed(2)} MB).`,
        ANSI.red
      )
    );
    exitCode = 1;
  }

  return exitCode;
};

const buildDeployBundle = async (
  entryPoints: string[],
  externalizeSchema: boolean
): Promise<BuildResult> =>
  build({
    bundle: true,
    entryPoints,
    format: 'esm',
    platform: 'browser',
    target: ['esnext'],
    write: false,
    metafile: true,
    logLevel: 'silent',
    outdir: 'out',
    splitting: true,
    jsx: 'automatic',
    conditions: ['convex', 'module'],
    minifySyntax: true,
    minifyIdentifiers: true,
    minifyWhitespace: false,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    plugins: externalizeSchema ? [schemaExternalFallbackPlugin] : [],
  });

const printDeployTopInputs = (
  outputBytes: number,
  aggregateInputBytes: Array<{ inputPath: string; bytes: number }>,
  options: AnalyzeOptions
): void => {
  const visibleInputs = aggregateInputBytes.filter(
    (input) => !isSmallInput(input.bytes, outputBytes, options.showSmall)
  );
  const topInputs = visibleInputs.slice(0, options.topInputs);

  if (topInputs.length === 0) {
    return;
  }

  console.log('');
  console.log(bold('Top inputs (deploy bundle):'));
  const inputPathWidth = Math.max(18, outputWidth - 46);
  console.log(
    dim(`bytesInOutput    share       impact  ${pad('path', inputPathWidth)}`)
  );
  console.log(
    dim(
      `-------------  ----------  ----------------  ${'-'.repeat(inputPathWidth)}`
    )
  );

  for (const input of topInputs) {
    const share = outputBytes > 0 ? (input.bytes / outputBytes) * 100 : 0;
    const sharePct = colorize(
      `${share.toFixed(2)}%`.padStart(10),
      shareColor(share)
    );
    const bar = makeShareBar(share);
    console.log(
      `${input.bytes.toString().padStart(13)}  ${sharePct}  ${bar}  ${compactPath(
        input.inputPath,
        inputPathWidth
      )}`
    );
  }
};

const printDeployTopPackages = (
  outputBytes: number,
  aggregateInputBytes: Array<{ inputPath: string; bytes: number }>,
  options: AnalyzeOptions
): void => {
  const packageMap = new Map<string, { bytes: number }>();
  for (const item of aggregateInputBytes) {
    const packageName = packageFromInputPath(item.inputPath);
    const current = packageMap.get(packageName) ?? { bytes: 0 };
    current.bytes += item.bytes;
    packageMap.set(packageName, current);
  }

  const packageRows = Array.from(packageMap.entries())
    .map(([packageName, value]) => ({ packageName, bytes: value.bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  const visibleRows = packageRows.filter(
    (item) => !isSmallInput(item.bytes, outputBytes, options.showSmall)
  );
  const topRows = visibleRows.slice(0, options.topPackages);

  if (topRows.length === 0) {
    return;
  }

  console.log('');
  console.log(bold('Top packages (deploy bundle):'));

  const packageColWidth = Math.max(16, Math.min(30, outputWidth - 58));
  const barWidth = Math.max(
    8,
    Math.min(16, outputWidth - (packageColWidth + 52))
  );

  for (const [index, item] of topRows.entries()) {
    const share = outputBytes > 0 ? (item.bytes / outputBytes) * 100 : 0;
    const shareStr = colorize(`${share.toFixed(2)}%`, shareColor(share));
    const sizeStr = colorize(`${toMB(item.bytes)} MB`, shareColor(share));
    const bar = makeShareBar(share, barWidth);
    const packageLabel = truncate(item.packageName, packageColWidth);

    console.log(
      `${bold(`${index + 1}.`)} ${pad(packageLabel, packageColWidth)} ${pad(sizeStr, 18)} ${pad(shareStr, 10)} ${bar}`
    );
  }
};

const runDeployAnalysis = async (
  roots: ProjectRoots,
  options: AnalyzeOptions
): Promise<number> => {
  const { entryPoints, nodeEntryPoints } = await collectAnalyzeEntrySelection(
    roots,
    options
  );

  if (entryPoints.length === 0) {
    console.log(
      'No Convex handler entries found to analyze (files exporting query/mutation/action, including internal variants).'
    );
    return 0;
  }

  let result: BuildResult;
  let schemaExternalized = false;

  try {
    result = await buildDeployBundle(entryPoints, false);
  } catch (error) {
    if (!shouldRetryWithSchemaExternalized(error)) {
      throw error;
    }
    result = await buildDeployBundle(entryPoints, true);
    schemaExternalized = true;
  }

  const meta = result.metafile;
  if (!meta) {
    throw new Error('No metafile generated for deploy analysis.');
  }

  const outputs = Object.entries(meta.outputs as Record<string, MetaOutput>)
    .filter(([outputPath]) => !outputPath.endsWith('.map'))
    .map(([outputPath, value]) => ({
      outputPath,
      ...value,
    }));

  const jsOutputs = outputs.filter((output) =>
    output.outputPath.endsWith('.js')
  );
  const totalOutputBytes = jsOutputs.reduce(
    (sum, output) => sum + output.bytes,
    0
  );

  const entryOutputs: DeployEntryOutput[] = jsOutputs
    .filter((output) => !!output.entryPoint)
    .map((output) => ({
      outputPath: output.outputPath,
      entryPoint: output.entryPoint as string,
      bytes: output.bytes,
      inputCount: Object.keys(output.inputs ?? {}).length,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const sharedChunks: DeployChunkOutput[] = jsOutputs
    .filter((output) => !output.entryPoint)
    .map((output) => ({
      outputPath: output.outputPath,
      bytes: output.bytes,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const aggregateInputs = new Map<string, number>();
  for (const output of jsOutputs) {
    for (const [inputPath, value] of Object.entries(output.inputs ?? {})) {
      const bytesInOutput = value.bytesInOutput ?? 0;
      aggregateInputs.set(
        inputPath,
        (aggregateInputs.get(inputPath) ?? 0) + bytesInOutput
      );
    }
  }

  const aggregateInputRows = Array.from(aggregateInputs.entries())
    .map(([inputPath, bytes]) => ({ inputPath, bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  const largestEntry = entryOutputs.at(0);
  const largestChunk = sharedChunks.at(0);

  console.log(bold('Runtime deploy analysis (isolate bundle)'));
  console.log(
    `entries=${entryPoints.length} nodeEntriesSkipped=${nodeEntryPoints.length} outputs=${jsOutputs.length} total=${formatBytes(
      totalOutputBytes
    )}`
  );
  if (schemaExternalized) {
    console.log(
      colorize(
        'note: schema imports were externalized after a build error; dependency sizes are approximate.',
        ANSI.yellow
      )
    );
  }
  if (largestEntry) {
    console.log(
      `largestEntry=${shortPath(largestEntry.entryPoint)} (${formatBytes(largestEntry.bytes)})`
    );
  }
  if (largestChunk) {
    console.log(
      `largestSharedChunk=${shortPath(largestChunk.outputPath)} (${formatBytes(
        largestChunk.bytes
      )})`
    );
  }
  console.log('');

  const topEntries = entryOutputs.slice(0, 15);
  if (topEntries.length > 0) {
    const widths = {
      rank: 4,
      sev: 7,
      output: 7,
      inputs: 6,
      entry: Math.max(24, Math.min(72, outputWidth - 34)),
    };

    console.log(
      dim(
        `${pad('Rank', widths.rank, 'right')}  ${pad('Level', widths.sev)}  ${pad('OutMB', widths.output, 'right')}  ${pad('In', widths.inputs, 'right')}  ${pad('Entry', widths.entry)}`
      )
    );
    console.log(
      dim(
        `${'-'.repeat(widths.rank)}  ${'-'.repeat(widths.sev)}  ${'-'.repeat(widths.output)}  ${'-'.repeat(widths.inputs)}  ${'-'.repeat(widths.entry)}`
      )
    );

    for (const [index, row] of topEntries.entries()) {
      const severity = severityForBytes(row.bytes, options);
      console.log(
        `${pad(String(index + 1), widths.rank, 'right')}  ${colorizePadded(
          severity,
          widths.sev,
          'left',
          severityColor(severity)
        )}  ${colorizePadded(
          toMB(row.bytes),
          widths.output,
          'right',
          shareColor((row.bytes / MB / options.dangerMb) * 100)
        )}  ${pad(String(row.inputCount), widths.inputs, 'right')}  ${pad(
          truncate(shortPath(row.entryPoint), widths.entry),
          widths.entry
        )}`
      );
    }
  }

  const topChunks = sharedChunks.slice(0, 8);
  if (topChunks.length > 0) {
    console.log('');
    console.log(bold('Top shared chunks:'));

    for (const chunk of topChunks) {
      const share =
        totalOutputBytes > 0 ? (chunk.bytes / totalOutputBytes) * 100 : 0;
      const severity = severityForBytes(chunk.bytes, options);
      console.log(
        `${colorize(`[${severity}]`, severityColor(severity))} ${pad(
          `${toMB(chunk.bytes)} MB`,
          10,
          'right'
        )} ${pad(`${share.toFixed(2)}%`, 8, 'right')} ${shortPath(chunk.outputPath)}`
      );
    }
  }

  if (options.details) {
    printDeployTopPackages(totalOutputBytes, aggregateInputRows, options);
    printDeployTopInputs(totalOutputBytes, aggregateInputRows, options);
  }

  const largestBytes = Math.max(
    largestEntry?.bytes ?? 0,
    largestChunk?.bytes ?? 0
  );
  if (options.failMb !== null && largestBytes / MB >= options.failMb) {
    console.log('');
    printWrapped({
      text: `Fail threshold reached: largest output is ${toMB(largestBytes)} MB (>= ${options.failMb.toFixed(2)} MB).`,
      color: ANSI.red,
    });
    return 1;
  }

  return 0;
};

export async function runAnalyze(argv: string[]): Promise<number> {
  const options = parseArgs(argv);
  colorEnabled = supportsColor;
  outputWidth = options.width ?? process.stdout.columns ?? DEFAULT_OUTPUT_WIDTH;

  const roots = detectProjectRoots();

  if (options.mode === 'hotspot') {
    return runHotspotAnalysis(roots, options);
  }

  return runDeployAnalysis(roots, options);
}

export const __test = {
  cycleHotspotSort,
  cycleHotspotDetailPane,
  cycleHotspotDetailPaneBackward,
  detectProjectRoots,
  filterEntryPointsByPattern,
  fitListViewport,
  getNativeHandlerExportNames,
  parseArgs,
  pickSelectedIndex,
  reduceInteractiveState,
  resolveInteractiveLayout,
  selectHotspotEntryPoints,
};

export type { AnalyzeOptions };
