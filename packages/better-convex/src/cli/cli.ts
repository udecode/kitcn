import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { createJiti } from 'jiti';
import { getTableConfig } from '../orm/introspection.js';
import { runAnalyze } from './analyze.js';
import { generateMeta, getConvexConfig } from './codegen.js';
import {
  type AggregateBackfillConfig,
  type BackfillEnabled,
  loadBetterConvexConfig,
  type MigrationConfig,
} from './config.js';
import { syncEnv } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve real convex CLI binary
// Can't use require.resolve('convex/bin/main.js') because it's not exported
// Use the path relative to the convex package
const require = createRequire(import.meta.url);
const convexPkg = require.resolve('convex/package.json');
const realConvex = join(dirname(convexPkg), 'bin/main.js');
const MISSING_BACKFILL_FUNCTION_RE =
  /could not find function|function .* was not found|unknown function/i;
const GITIGNORE_CONVEX_ENTRY_RE = /(^|\r?\n)\.convex\/?\s*(\r?\n|$)/m;
const TS_EXTENSION_RE = /\.ts$/;
const AGGREGATE_STATE_RELATIVE_PATH = join(
  '.convex',
  'better-convex',
  'aggregate-backfill-state.json'
);
const AGGREGATE_STATE_VERSION = 1;

export type ParsedArgs = {
  command: string;
  restArgs: string[];
  convexArgs: string[];
  debug: boolean;
  outputDir?: string;
  scope?: 'all' | 'auth' | 'orm';
  configPath?: string;
};

const VALID_SCOPES = new Set(['all', 'auth', 'orm']);

// Parse args: better-convex [command] [--api <dir>] [--scope <all|auth|orm>] [--config <path>] [--debug] [...convex-args]
export function parseArgs(argv: string[]): ParsedArgs {
  let debug = false;
  let outputDir: string | undefined;
  let scope: 'all' | 'auth' | 'orm' | undefined;
  let configPath: string | undefined;

  const filtered: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === '--debug') {
      debug = true;
      continue;
    }

    if (a === '--api') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --api.');
      }
      outputDir = value;
      i += 1; // skip value
      continue;
    }

    if (a === '--scope') {
      const value = argv[i + 1];
      if (!value || !VALID_SCOPES.has(value)) {
        throw new Error(
          `Invalid --scope value "${value ?? ''}". Expected one of: all, auth, orm.`
        );
      }
      scope = value as 'all' | 'auth' | 'orm';
      i += 1; // skip value
      continue;
    }

    if (a === '--config') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --config.');
      }
      configPath = value;
      i += 1; // skip value
      continue;
    }

    filtered.push(a);
  }

  const command = filtered[0] || 'dev';
  const restArgs = filtered.slice(1);

  return {
    command,
    restArgs,
    convexArgs: restArgs,
    debug,
    outputDir,
    scope,
    configPath,
  };
}

type AggregateFingerprintState = {
  version: number;
  entries: Record<
    string,
    {
      fingerprint: string;
      updatedAt: number;
    }
  >;
};

const DEFAULT_AGGREGATE_FINGERPRINT_STATE: AggregateFingerprintState = {
  version: AGGREGATE_STATE_VERSION,
  entries: {},
};

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [
    ...new Set(
      values.filter((value): value is string => typeof value === 'string')
    ),
  ].sort();
}

function readOptionalCliFlagValue(
  args: string[],
  flag: string
): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag) {
      const value = args[i + 1];
      if (value) {
        return value;
      }
      continue;
    }
    const withEquals = `${flag}=`;
    if (arg.startsWith(withEquals)) {
      const value = arg.slice(withEquals.length);
      if (value) {
        return value;
      }
    }
  }
  return;
}

function collectSchemaTables(schemaModule: Record<string, unknown>): unknown[] {
  const allTables = new Set<unknown>();
  const relations = schemaModule.relations;
  if (relations && typeof relations === 'object' && !Array.isArray(relations)) {
    for (const relationConfig of Object.values(
      relations as Record<string, unknown>
    )) {
      const table = (relationConfig as { table?: unknown })?.table;
      if (table) {
        allTables.add(table);
      }
    }
  }

  const tables = schemaModule.tables;
  if (tables && typeof tables === 'object' && !Array.isArray(tables)) {
    for (const table of Object.values(tables as Record<string, unknown>)) {
      if (table) {
        allTables.add(table);
      }
    }
  }

  return [...allTables];
}

function buildAggregateFingerprintPayload(tables: unknown[]): Array<{
  tableName: string;
  aggregateIndexes: Array<{
    name: string;
    fields: string[];
    countFields: string[];
    sumFields: string[];
    avgFields: string[];
    minFields: string[];
    maxFields: string[];
  }>;
}> {
  return tables
    .map((table) => getTableConfig(table as any))
    .map((tableConfig) => ({
      tableName: tableConfig.name,
      aggregateIndexes: tableConfig.aggregateIndexes
        .map((index) => ({
          name: index.name,
          fields: normalizeStringList(index.fields),
          countFields: normalizeStringList(index.countFields),
          sumFields: normalizeStringList(index.sumFields),
          avgFields: normalizeStringList(index.avgFields),
          minFields: normalizeStringList(index.minFields),
          maxFields: normalizeStringList(index.maxFields),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.tableName.localeCompare(b.tableName));
}

async function computeAggregateIndexFingerprint(
  functionsDir: string
): Promise<string | null> {
  const schemaPath = join(functionsDir, 'schema.ts');
  if (!fs.existsSync(schemaPath)) {
    return null;
  }

  const jiti = createJiti(process.cwd(), {
    interopDefault: true,
    moduleCache: false,
  });
  const schemaModule = await jiti.import(schemaPath);
  if (!schemaModule || typeof schemaModule !== 'object') {
    return null;
  }

  const tables = collectSchemaTables(schemaModule as Record<string, unknown>);
  if (tables.length === 0) {
    return null;
  }

  const payload = buildAggregateFingerprintPayload(tables);
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function getDevAggregateBackfillStatePath(cwd = process.cwd()): string {
  return join(cwd, AGGREGATE_STATE_RELATIVE_PATH);
}

function readAggregateFingerprintState(
  statePath: string
): AggregateFingerprintState {
  if (!fs.existsSync(statePath)) {
    return {
      ...DEFAULT_AGGREGATE_FINGERPRINT_STATE,
      entries: {},
    };
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AggregateFingerprintState>;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.entries !== 'object' ||
      parsed.entries === null
    ) {
      return {
        ...DEFAULT_AGGREGATE_FINGERPRINT_STATE,
        entries: {},
      };
    }
    return {
      version: AGGREGATE_STATE_VERSION,
      entries: Object.fromEntries(
        Object.entries(parsed.entries).filter(
          ([, value]) =>
            typeof value === 'object' &&
            value !== null &&
            typeof (value as any).fingerprint === 'string'
        )
      ) as AggregateFingerprintState['entries'],
    };
  } catch {
    return {
      ...DEFAULT_AGGREGATE_FINGERPRINT_STATE,
      entries: {},
    };
  }
}

function writeAggregateFingerprintState(
  statePath: string,
  state: AggregateFingerprintState
): void {
  fs.mkdirSync(dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, statePath);
}

export function getAggregateBackfillDeploymentKey(args: string[]): string {
  if (args.includes('--prod')) {
    return 'prod';
  }

  const deploymentName = readOptionalCliFlagValue(args, '--deployment-name');
  if (deploymentName) {
    return `deployment:${deploymentName}`;
  }

  const previewName = readOptionalCliFlagValue(args, '--preview-name');
  if (previewName) {
    return `preview:${previewName}`;
  }

  return 'local';
}

export function ensureConvexGitignoreEntry(cwd = process.cwd()): void {
  let currentDir = resolve(cwd);
  let gitRoot: string | null = null;
  while (true) {
    if (fs.existsSync(join(currentDir, '.git'))) {
      gitRoot = currentDir;
      break;
    }
    const parent = dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

  if (!gitRoot) {
    return;
  }

  const gitignorePath = join(gitRoot, '.gitignore');
  const existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : '';

  if (GITIGNORE_CONVEX_ENTRY_RE.test(existing)) {
    return;
  }

  const normalized =
    existing.endsWith('\n') || existing.length === 0
      ? existing
      : `${existing}\n`;
  fs.writeFileSync(gitignorePath, `${normalized}.convex/\n`);
}

// Track child processes for cleanup
const processes: any[] = [];

function cleanup() {
  for (const proc of processes) {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  }
}

export type RunDeps = {
  execa: typeof execa;
  runAnalyze: typeof runAnalyze;
  generateMeta: typeof generateMeta;
  getConvexConfig: typeof getConvexConfig;
  syncEnv: typeof syncEnv;
  loadBetterConvexConfig: typeof loadBetterConvexConfig;
  ensureConvexGitignoreEntry: typeof ensureConvexGitignoreEntry;
  enableDevSchemaWatch: boolean;
  realConvex: string;
};

function deriveScopeFromToggles(
  api: boolean,
  auth: boolean
): 'all' | 'auth' | 'orm' | null {
  if (api && auth) return 'all';
  if (!api && auth) return 'auth';
  if (!api && !auth) return 'orm';
  return null;
}

type BackfillCliOverrides = {
  enabled?: BackfillEnabled;
  wait?: boolean;
  batchSize?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  strict?: boolean;
};

type MigrationCliOverrides = {
  enabled?: BackfillEnabled;
  wait?: boolean;
  batchSize?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  strict?: boolean;
  allowDrift?: boolean;
};

type ResetCliOptions = {
  confirmed: boolean;
  beforeHook?: string;
  afterHook?: string;
  remainingArgs: string[];
};

const VALID_BACKFILL_ENABLED = new Set<BackfillEnabled>(['auto', 'on', 'off']);

function parsePositiveIntegerArg(flag: string, raw: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} expects a positive integer.`);
  }
  return parsed;
}

function readFlagValue(
  args: string[],
  index: number,
  flag: string
): { value: string; nextIndex: number } {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return { value, nextIndex: index + 1 };
}

function extractBackfillCliOptions(args: string[]): {
  remainingArgs: string[];
  overrides: BackfillCliOverrides;
} {
  const remainingArgs: string[] = [];
  const overrides: BackfillCliOverrides = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--force') {
      continue;
    }
    if (arg === '--backfill') {
      const { value, nextIndex } = readFlagValue(args, i, '--backfill');
      if (!VALID_BACKFILL_ENABLED.has(value as BackfillEnabled)) {
        throw new Error('Invalid --backfill value. Expected auto, on, or off.');
      }
      overrides.enabled = value as BackfillEnabled;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--backfill=')) {
      const value = arg.slice('--backfill='.length);
      if (!VALID_BACKFILL_ENABLED.has(value as BackfillEnabled)) {
        throw new Error('Invalid --backfill value. Expected auto, on, or off.');
      }
      overrides.enabled = value as BackfillEnabled;
      continue;
    }
    if (arg === '--backfill-mode') {
      readFlagValue(args, i, '--backfill-mode');
      throw new Error(
        '`--backfill-mode` was removed. Use `better-convex aggregate rebuild`.'
      );
    }
    if (arg.startsWith('--backfill-mode=')) {
      throw new Error(
        '`--backfill-mode` was removed. Use `better-convex aggregate rebuild`.'
      );
    }
    if (arg === '--backfill-wait') {
      overrides.wait = true;
      continue;
    }
    if (arg === '--no-backfill-wait') {
      overrides.wait = false;
      continue;
    }
    if (arg === '--backfill-strict') {
      overrides.strict = true;
      continue;
    }
    if (arg === '--no-backfill-strict') {
      overrides.strict = false;
      continue;
    }
    if (arg === '--backfill-batch-size') {
      const { value, nextIndex } = readFlagValue(
        args,
        i,
        '--backfill-batch-size'
      );
      overrides.batchSize = parsePositiveIntegerArg(
        '--backfill-batch-size',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--backfill-batch-size=')) {
      overrides.batchSize = parsePositiveIntegerArg(
        '--backfill-batch-size',
        arg.slice('--backfill-batch-size='.length)
      );
      continue;
    }
    if (arg === '--backfill-timeout-ms') {
      const { value, nextIndex } = readFlagValue(
        args,
        i,
        '--backfill-timeout-ms'
      );
      overrides.timeoutMs = parsePositiveIntegerArg(
        '--backfill-timeout-ms',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--backfill-timeout-ms=')) {
      overrides.timeoutMs = parsePositiveIntegerArg(
        '--backfill-timeout-ms',
        arg.slice('--backfill-timeout-ms='.length)
      );
      continue;
    }
    if (arg === '--backfill-poll-ms') {
      const { value, nextIndex } = readFlagValue(args, i, '--backfill-poll-ms');
      overrides.pollIntervalMs = parsePositiveIntegerArg(
        '--backfill-poll-ms',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--backfill-poll-ms=')) {
      overrides.pollIntervalMs = parsePositiveIntegerArg(
        '--backfill-poll-ms',
        arg.slice('--backfill-poll-ms='.length)
      );
      continue;
    }
    remainingArgs.push(arg);
  }

  return {
    remainingArgs,
    overrides,
  };
}

function extractMigrationCliOptions(args: string[]): {
  remainingArgs: string[];
  overrides: MigrationCliOverrides;
} {
  const remainingArgs: string[] = [];
  const overrides: MigrationCliOverrides = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--migrations') {
      const { value, nextIndex } = readFlagValue(args, i, '--migrations');
      if (!VALID_BACKFILL_ENABLED.has(value as BackfillEnabled)) {
        throw new Error(
          'Invalid --migrations value. Expected auto, on, or off.'
        );
      }
      overrides.enabled = value as BackfillEnabled;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--migrations=')) {
      const value = arg.slice('--migrations='.length);
      if (!VALID_BACKFILL_ENABLED.has(value as BackfillEnabled)) {
        throw new Error(
          'Invalid --migrations value. Expected auto, on, or off.'
        );
      }
      overrides.enabled = value as BackfillEnabled;
      continue;
    }
    if (arg === '--migrations-wait') {
      overrides.wait = true;
      continue;
    }
    if (arg === '--no-migrations-wait') {
      overrides.wait = false;
      continue;
    }
    if (arg === '--migrations-strict') {
      overrides.strict = true;
      continue;
    }
    if (arg === '--no-migrations-strict') {
      overrides.strict = false;
      continue;
    }
    if (arg === '--migrations-allow-drift') {
      overrides.allowDrift = true;
      continue;
    }
    if (arg === '--no-migrations-allow-drift') {
      overrides.allowDrift = false;
      continue;
    }
    if (arg === '--migrations-batch-size') {
      const { value, nextIndex } = readFlagValue(
        args,
        i,
        '--migrations-batch-size'
      );
      overrides.batchSize = parsePositiveIntegerArg(
        '--migrations-batch-size',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--migrations-batch-size=')) {
      overrides.batchSize = parsePositiveIntegerArg(
        '--migrations-batch-size',
        arg.slice('--migrations-batch-size='.length)
      );
      continue;
    }
    if (arg === '--migrations-timeout-ms') {
      const { value, nextIndex } = readFlagValue(
        args,
        i,
        '--migrations-timeout-ms'
      );
      overrides.timeoutMs = parsePositiveIntegerArg(
        '--migrations-timeout-ms',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--migrations-timeout-ms=')) {
      overrides.timeoutMs = parsePositiveIntegerArg(
        '--migrations-timeout-ms',
        arg.slice('--migrations-timeout-ms='.length)
      );
      continue;
    }
    if (arg === '--migrations-poll-ms') {
      const { value, nextIndex } = readFlagValue(
        args,
        i,
        '--migrations-poll-ms'
      );
      overrides.pollIntervalMs = parsePositiveIntegerArg(
        '--migrations-poll-ms',
        value
      );
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--migrations-poll-ms=')) {
      overrides.pollIntervalMs = parsePositiveIntegerArg(
        '--migrations-poll-ms',
        arg.slice('--migrations-poll-ms='.length)
      );
      continue;
    }

    remainingArgs.push(arg);
  }

  return {
    remainingArgs,
    overrides,
  };
}

function extractResetCliOptions(args: string[]): ResetCliOptions {
  const remainingArgs: string[] = [];
  let confirmed = false;
  let beforeHook: string | undefined;
  let afterHook: string | undefined;

  const isBackfillFlag = (arg: string) =>
    arg === '--backfill' ||
    arg.startsWith('--backfill=') ||
    arg.startsWith('--backfill-') ||
    arg.startsWith('--no-backfill-');

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (isBackfillFlag(arg)) {
      throw new Error(
        '`better-convex reset` does not accept backfill flags. It always runs aggregateBackfill in resume mode.'
      );
    }
    if (arg === '--yes') {
      confirmed = true;
      continue;
    }
    if (arg === '--before') {
      const { value, nextIndex } = readFlagValue(args, i, '--before');
      beforeHook = value;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--before=')) {
      const value = arg.slice('--before='.length);
      if (!value) {
        throw new Error('Missing value for --before.');
      }
      beforeHook = value;
      continue;
    }
    if (arg === '--after') {
      const { value, nextIndex } = readFlagValue(args, i, '--after');
      afterHook = value;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--after=')) {
      const value = arg.slice('--after='.length);
      if (!value) {
        throw new Error('Missing value for --after.');
      }
      afterHook = value;
      continue;
    }
    remainingArgs.push(arg);
  }

  return {
    confirmed,
    beforeHook,
    afterHook,
    remainingArgs,
  };
}

function resolveBackfillConfig(
  base: AggregateBackfillConfig | undefined,
  overrides: BackfillCliOverrides
): AggregateBackfillConfig {
  const fallback: AggregateBackfillConfig = {
    enabled: 'auto',
    wait: true,
    batchSize: 1000,
    timeoutMs: 900_000,
    pollIntervalMs: 1000,
    strict: false,
  };
  const resolvedBase = base ?? fallback;
  return {
    ...resolvedBase,
    enabled: overrides.enabled ?? resolvedBase.enabled,
    wait: overrides.wait ?? resolvedBase.wait,
    batchSize: overrides.batchSize ?? resolvedBase.batchSize,
    timeoutMs: overrides.timeoutMs ?? resolvedBase.timeoutMs,
    pollIntervalMs: overrides.pollIntervalMs ?? resolvedBase.pollIntervalMs,
    strict: overrides.strict ?? resolvedBase.strict,
  };
}

function resolveMigrationConfig(
  base: MigrationConfig | undefined,
  overrides: MigrationCliOverrides
): MigrationConfig {
  const fallback: MigrationConfig = {
    enabled: 'auto',
    wait: true,
    batchSize: 256,
    timeoutMs: 900_000,
    pollIntervalMs: 1000,
    strict: false,
    allowDrift: true,
  };
  const resolvedBase = base ?? fallback;
  return {
    ...resolvedBase,
    enabled: overrides.enabled ?? resolvedBase.enabled,
    wait: overrides.wait ?? resolvedBase.wait,
    batchSize: overrides.batchSize ?? resolvedBase.batchSize,
    timeoutMs: overrides.timeoutMs ?? resolvedBase.timeoutMs,
    pollIntervalMs: overrides.pollIntervalMs ?? resolvedBase.pollIntervalMs,
    strict: overrides.strict ?? resolvedBase.strict,
    allowDrift: overrides.allowDrift ?? resolvedBase.allowDrift,
  };
}

function extractRunDeploymentArgs(args: string[]): string[] {
  const deploymentArgs: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--prod') {
      deploymentArgs.push(arg);
      continue;
    }
    if (
      arg === '--preview-name' ||
      arg === '--deployment-name' ||
      arg === '--env-file' ||
      arg === '--component'
    ) {
      const value = args[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}.`);
      }
      deploymentArgs.push(arg, value);
      i += 1;
      continue;
    }
    if (
      arg.startsWith('--preview-name=') ||
      arg.startsWith('--deployment-name=') ||
      arg.startsWith('--env-file=') ||
      arg.startsWith('--component=')
    ) {
      deploymentArgs.push(arg);
    }
  }
  return deploymentArgs;
}

function isMissingBackfillFunctionOutput(output: string): boolean {
  return MISSING_BACKFILL_FUNCTION_RE.test(output);
}

function parseConvexRunJson<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return [] as T;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const lines = trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      try {
        return JSON.parse(line) as T;
      } catch {}
    }
  }
  throw new Error(
    `Failed to parse convex run output as JSON.\nOutput:\n${stdout.trim()}`
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    signal?.addEventListener('abort', onAbort);
  });
}

async function runConvexFunction(
  execaFn: typeof execa,
  realConvexPath: string,
  functionName: string,
  args: Record<string, unknown>,
  deploymentArgs: string[],
  options?: {
    echoOutput?: boolean;
  }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await execaFn(
    'node',
    [
      realConvexPath,
      'run',
      ...deploymentArgs,
      functionName,
      JSON.stringify(args),
    ],
    {
      cwd: process.cwd(),
      reject: false,
      stdio: 'pipe',
    }
  );
  const stdout =
    typeof (result as any).stdout === 'string' ? (result as any).stdout : '';
  const stderr =
    typeof (result as any).stderr === 'string' ? (result as any).stderr : '';
  if (options?.echoOutput !== false) {
    if (stdout) {
      process.stdout.write(stdout.endsWith('\n') ? stdout : `${stdout}\n`);
    }
    if (stderr) {
      process.stderr.write(stderr.endsWith('\n') ? stderr : `${stderr}\n`);
    }
  }
  return {
    exitCode: result.exitCode ?? 1,
    stdout,
    stderr,
  };
}

async function runAggregateBackfillFlow(params: {
  execaFn: typeof execa;
  realConvexPath: string;
  backfillConfig: AggregateBackfillConfig;
  mode: 'resume' | 'rebuild';
  deploymentArgs: string[];
  signal?: AbortSignal;
  context: 'deploy' | 'dev' | 'aggregate';
}): Promise<number> {
  const {
    execaFn,
    realConvexPath,
    backfillConfig,
    mode,
    deploymentArgs,
    signal,
    context,
  } = params;
  if (signal?.aborted) {
    return 0;
  }

  if (backfillConfig.enabled === 'off') {
    return 0;
  }

  const kickoff = await runConvexFunction(
    execaFn,
    realConvexPath,
    'generated/server:aggregateBackfill',
    {
      mode,
      batchSize: backfillConfig.batchSize,
    },
    deploymentArgs,
    {
      echoOutput: false,
    }
  );

  if (kickoff.exitCode !== 0) {
    const combinedOutput = `${kickoff.stdout}\n${kickoff.stderr}`;
    if (
      backfillConfig.enabled === 'auto' &&
      isMissingBackfillFunctionOutput(combinedOutput)
    ) {
      if (context === 'deploy') {
        console.info(
          'ℹ️  aggregateBackfill not found in this deployment; skipping post-deploy backfill (auto mode).'
        );
      }
      return 0;
    }
    return kickoff.exitCode;
  }

  type KickoffResult = {
    targets?: number;
    needsRebuild?: number;
    scheduled?: number;
    skippedReady?: number;
    pruned?: number;
    mode?: string;
  };
  const kickoffPayload = parseConvexRunJson<KickoffResult | unknown[]>(
    kickoff.stdout
  );
  const needsRebuild =
    typeof kickoffPayload === 'object' &&
    kickoffPayload !== null &&
    !Array.isArray(kickoffPayload) &&
    typeof kickoffPayload.needsRebuild === 'number'
      ? kickoffPayload.needsRebuild
      : 0;
  const scheduled =
    typeof kickoffPayload === 'object' &&
    kickoffPayload !== null &&
    !Array.isArray(kickoffPayload) &&
    typeof kickoffPayload.scheduled === 'number'
      ? kickoffPayload.scheduled
      : 0;
  const targets =
    typeof kickoffPayload === 'object' &&
    kickoffPayload !== null &&
    !Array.isArray(kickoffPayload) &&
    typeof kickoffPayload.targets === 'number'
      ? kickoffPayload.targets
      : 0;
  const pruned =
    typeof kickoffPayload === 'object' &&
    kickoffPayload !== null &&
    !Array.isArray(kickoffPayload) &&
    typeof kickoffPayload.pruned === 'number'
      ? kickoffPayload.pruned
      : 0;
  if (pruned > 0) {
    console.info(`ℹ️  aggregateBackfill pruned ${pruned} removed indexes`);
  }
  if (mode === 'resume' && needsRebuild > 0) {
    const message = `Aggregate backfill found ${needsRebuild} index definitions that require rebuild. Run \`better-convex aggregate rebuild\` for this deployment.`;
    if (backfillConfig.strict) {
      console.error(`❌ ${message}`);
      return 1;
    }
    console.warn(`⚠️  ${message}`);
  } else if (scheduled > 0) {
    console.info(
      `ℹ️  aggregateBackfill scheduled ${scheduled}/${targets} target indexes`
    );
  }

  if (!backfillConfig.wait || signal?.aborted) {
    return 0;
  }

  const deadline = Date.now() + backfillConfig.timeoutMs;
  let lastProgress = '';
  while (!signal?.aborted) {
    const statusResult = await runConvexFunction(
      execaFn,
      realConvexPath,
      'generated/server:aggregateBackfillStatus',
      {},
      deploymentArgs,
      {
        echoOutput: false,
      }
    );
    if (statusResult.exitCode !== 0) {
      return statusResult.exitCode;
    }

    type BackfillStatusEntry = {
      status: string;
      tableName: string;
      indexName: string;
      lastError?: string | null;
    };
    const statuses = parseConvexRunJson<BackfillStatusEntry[]>(
      statusResult.stdout
    );
    const failed = statuses.find((entry) => Boolean(entry.lastError));
    if (failed) {
      console.error(
        `❌ Aggregate backfill failed for ${failed.tableName}.${failed.indexName}: ${failed.lastError}`
      );
      return backfillConfig.strict ? 1 : 0;
    }

    const total = statuses.length;
    const ready = statuses.filter((entry) => entry.status === 'READY').length;
    const progress = `${ready}/${total}`;
    if (progress !== lastProgress) {
      lastProgress = progress;
      if (total > 0) {
        console.info(`ℹ️  aggregateBackfill progress ${ready}/${total} READY`);
      }
    }

    if (total === 0 || ready === total) {
      return 0;
    }
    if (Date.now() > deadline) {
      const timeoutMessage = `Aggregate backfill timed out after ${backfillConfig.timeoutMs}ms (${ready}/${total} READY).`;
      if (backfillConfig.strict) {
        console.error(`❌ ${timeoutMessage}`);
        return 1;
      }
      console.warn(`⚠️  ${timeoutMessage}`);
      return 0;
    }
    await sleep(backfillConfig.pollIntervalMs, signal);
  }

  return 0;
}

async function runAggregatePruneFlow(params: {
  execaFn: typeof execa;
  realConvexPath: string;
  deploymentArgs: string[];
}): Promise<number> {
  const { execaFn, realConvexPath, deploymentArgs } = params;
  const result = await runConvexFunction(
    execaFn,
    realConvexPath,
    'generated/server:aggregateBackfill',
    {
      mode: 'prune',
    },
    deploymentArgs,
    {
      echoOutput: false,
    }
  );

  if (result.exitCode !== 0) {
    return result.exitCode;
  }

  type PruneResult = {
    pruned?: number;
  };
  const payload = parseConvexRunJson<PruneResult | unknown[]>(result.stdout);
  const pruned =
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    typeof payload.pruned === 'number'
      ? payload.pruned
      : 0;

  if (pruned > 0) {
    console.info(`ℹ️  aggregateBackfill pruned ${pruned} removed indexes`);
  } else {
    console.info('ℹ️  aggregateBackfill prune no-op');
  }

  return 0;
}

function slugifyMigrationName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function createMigrationTimestamp(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

function extractMigrationDownOptions(args: string[]): {
  remainingArgs: string[];
  steps?: number;
  to?: string;
} {
  const remainingArgs: string[] = [];
  let steps: number | undefined;
  let to: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--steps') {
      const { value, nextIndex } = readFlagValue(args, i, '--steps');
      steps = parsePositiveIntegerArg('--steps', value);
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--steps=')) {
      steps = parsePositiveIntegerArg('--steps', arg.slice('--steps='.length));
      continue;
    }
    if (arg === '--to') {
      const { value, nextIndex } = readFlagValue(args, i, '--to');
      to = value;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--to=')) {
      const value = arg.slice('--to='.length);
      if (!value) {
        throw new Error('Missing value for --to.');
      }
      to = value;
      continue;
    }
    remainingArgs.push(arg);
  }

  if (steps !== undefined && to !== undefined) {
    throw new Error('Use either --steps or --to, not both.');
  }

  return {
    remainingArgs,
    steps,
    to,
  };
}

function renderMigrationManifest(ids: string[]): string {
  const sorted = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  const importLines = sorted.map(
    (id, index) => `import { migration as migration_${index} } from './${id}';`
  );
  const entryLines = sorted.map((_, index) => `  migration_${index},`);

  return `// biome-ignore-all format: generated
// This file is auto-generated by better-convex migrate create.
// Do not edit manually.

import { defineMigrationSet } from 'better-convex/orm';
${importLines.join('\n')}

export const migrations = defineMigrationSet([
${entryLines.join('\n')}
]);
`;
}

async function runMigrationCreate(params: {
  migrationName: string;
  functionsDir: string;
}): Promise<void> {
  const { migrationName, functionsDir } = params;
  const normalizedName = slugifyMigrationName(migrationName);
  if (!normalizedName) {
    throw new Error(
      'Migration name must include at least one letter or digit.'
    );
  }

  const timestamp = createMigrationTimestamp();
  const migrationId = `${timestamp}_${normalizedName}`;
  const migrationsDir = join(functionsDir, 'migrations');
  const migrationFile = join(migrationsDir, `${migrationId}.ts`);
  const manifestFile = join(migrationsDir, 'manifest.ts');

  fs.mkdirSync(migrationsDir, { recursive: true });
  if (fs.existsSync(migrationFile)) {
    throw new Error(
      `Migration file already exists for '${migrationId}'. Wait one second and retry.`
    );
  }

  const migrationSource = `import { defineMigration } from '../generated/migrations.gen';

export const migration = defineMigration({
  id: '${migrationId}',
  description: '${migrationName.replaceAll("'", "\\'")}',
  up: {
    table: 'replace_with_table_name',
    migrateOne: async () => {
      // TODO: implement migration logic.
    },
  },
  down: {
    table: 'replace_with_table_name',
    migrateOne: async () => {
      // TODO: implement rollback logic.
    },
  },
});
`;
  fs.writeFileSync(migrationFile, migrationSource);

  const existingMigrationIds = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => file.replace(TS_EXTENSION_RE, ''))
    .filter((id) => id !== 'manifest')
    .sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(manifestFile, renderMigrationManifest(existingMigrationIds));

  console.info(`ℹ️  created migration ${migrationId}`);
  console.info(`ℹ️  file: ${migrationFile}`);
  console.info(`ℹ️  manifest: ${manifestFile}`);
}

async function runMigrationFlow(params: {
  execaFn: typeof execa;
  realConvexPath: string;
  migrationConfig: MigrationConfig;
  deploymentArgs: string[];
  signal?: AbortSignal;
  context: 'deploy' | 'dev' | 'migration';
  direction: 'up' | 'down';
  steps?: number;
  to?: string;
}): Promise<number> {
  const {
    execaFn,
    realConvexPath,
    migrationConfig,
    deploymentArgs,
    signal,
    context,
    direction,
    steps,
    to,
  } = params;
  if (signal?.aborted || migrationConfig.enabled === 'off') {
    return 0;
  }

  const kickoff = await runConvexFunction(
    execaFn,
    realConvexPath,
    'generated/server:migrationRun',
    {
      direction,
      batchSize: migrationConfig.batchSize,
      allowDrift: migrationConfig.allowDrift,
      ...(steps !== undefined ? { steps } : {}),
      ...(to !== undefined ? { to } : {}),
    },
    deploymentArgs,
    {
      echoOutput: false,
    }
  );

  if (kickoff.exitCode !== 0) {
    const combinedOutput = `${kickoff.stdout}\n${kickoff.stderr}`;
    if (
      migrationConfig.enabled === 'auto' &&
      isMissingBackfillFunctionOutput(combinedOutput)
    ) {
      if (context === 'deploy') {
        console.info(
          'ℹ️  migration runtime not found in this deployment; skipping (auto mode).'
        );
      }
      return 0;
    }
    return kickoff.exitCode;
  }

  type KickoffPayload = {
    status?: string;
    runId?: string;
    drift?: Array<{ message?: string }>;
    plan?: string[];
  };
  const payload = parseConvexRunJson<KickoffPayload | unknown[]>(
    kickoff.stdout
  );
  const kickoffStatus =
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    typeof payload.status === 'string'
      ? payload.status
      : 'running';

  const driftMessages =
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    Array.isArray(payload.drift)
      ? payload.drift
          .map((entry) => entry?.message)
          .filter((entry): entry is string => typeof entry === 'string')
      : [];

  if (kickoffStatus === 'drift_blocked') {
    const message =
      driftMessages[0] ??
      'Migration drift detected and blocked by current policy.';
    if (migrationConfig.strict) {
      console.error(`❌ ${message}`);
      return 1;
    }
    console.warn(`⚠️  ${message}`);
    return 0;
  }
  if (kickoffStatus === 'noop') {
    const noopMessage =
      direction === 'down'
        ? 'No applied migrations to roll back.'
        : 'No pending migrations to apply.';
    console.info(`ℹ️  ${noopMessage}`);
    return 0;
  }
  if (kickoffStatus === 'dry_run') {
    console.info('ℹ️  migration dry run completed (no writes committed).');
    return 0;
  }

  const runId =
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    typeof payload.runId === 'string'
      ? payload.runId
      : undefined;

  if (!migrationConfig.wait || signal?.aborted || !runId) {
    return 0;
  }

  const deadline = Date.now() + migrationConfig.timeoutMs;
  let lastStatusLine = '';
  while (!signal?.aborted) {
    const statusResult = await runConvexFunction(
      execaFn,
      realConvexPath,
      'generated/server:migrationStatus',
      {
        runId,
      },
      deploymentArgs,
      {
        echoOutput: false,
      }
    );
    if (statusResult.exitCode !== 0) {
      return statusResult.exitCode;
    }

    type StatusPayload = {
      activeRun?: { status?: string } | null;
      runs?: Array<{
        status?: string;
        currentIndex?: number;
        migrationIds?: string[];
      }>;
    };
    const statusPayload = parseConvexRunJson<StatusPayload | unknown[]>(
      statusResult.stdout
    );
    const runStatus =
      typeof statusPayload === 'object' &&
      statusPayload !== null &&
      !Array.isArray(statusPayload)
        ? (statusPayload.activeRun?.status ??
          statusPayload.runs?.[0]?.status ??
          'unknown')
        : 'unknown';

    const currentIndex =
      typeof statusPayload === 'object' &&
      statusPayload !== null &&
      !Array.isArray(statusPayload) &&
      typeof statusPayload.runs?.[0]?.currentIndex === 'number'
        ? statusPayload.runs[0].currentIndex
        : 0;
    const total =
      typeof statusPayload === 'object' &&
      statusPayload !== null &&
      !Array.isArray(statusPayload) &&
      Array.isArray(statusPayload.runs?.[0]?.migrationIds)
        ? (statusPayload.runs?.[0]?.migrationIds?.length ?? 0)
        : 0;
    const statusLine = `${runStatus}:${currentIndex}/${total}`;
    if (statusLine !== lastStatusLine && total > 0) {
      lastStatusLine = statusLine;
      console.info(`ℹ️  migration ${runStatus} ${currentIndex}/${total}`);
    }

    if (runStatus === 'completed' || runStatus === 'noop') {
      return 0;
    }
    if (runStatus === 'failed' || runStatus === 'canceled') {
      const message = `Migrations ${runStatus} for run ${runId}.`;
      if (migrationConfig.strict) {
        console.error(`❌ ${message}`);
        return 1;
      }
      console.warn(`⚠️  ${message}`);
      return 0;
    }

    if (Date.now() > deadline) {
      const timeoutMessage = `Migrations timed out after ${migrationConfig.timeoutMs}ms.`;
      if (migrationConfig.strict) {
        console.error(`❌ ${timeoutMessage}`);
        return 1;
      }
      console.warn(`⚠️  ${timeoutMessage}`);
      return 0;
    }

    await sleep(migrationConfig.pollIntervalMs, signal);
  }

  return 0;
}

async function runDevSchemaBackfillIfNeeded(params: {
  execaFn: typeof execa;
  realConvexPath: string;
  backfillConfig: AggregateBackfillConfig;
  functionsDir: string;
  deploymentArgs: string[];
  signal: AbortSignal;
}): Promise<number> {
  const {
    execaFn,
    realConvexPath,
    backfillConfig,
    functionsDir,
    deploymentArgs,
    signal,
  } = params;
  const fingerprint = await computeAggregateIndexFingerprint(functionsDir);
  if (!fingerprint) {
    return 0;
  }

  const deploymentKey = getAggregateBackfillDeploymentKey(deploymentArgs);
  const statePath = getDevAggregateBackfillStatePath();
  const state = readAggregateFingerprintState(statePath);
  const existing = state.entries[deploymentKey];
  if (existing?.fingerprint === fingerprint) {
    return 0;
  }

  console.info(`ℹ️  aggregateBackfill resume (${deploymentKey} schema change)`);
  const exitCode = await runAggregateBackfillFlow({
    execaFn,
    realConvexPath,
    backfillConfig: {
      ...backfillConfig,
      enabled: 'on',
    },
    mode: 'resume',
    deploymentArgs,
    signal,
    context: 'dev',
  });
  if (exitCode !== 0 || signal.aborted) {
    return exitCode;
  }

  state.entries[deploymentKey] = {
    fingerprint,
    updatedAt: Date.now(),
  };
  writeAggregateFingerprintState(statePath, state);
  return 0;
}

export async function run(
  argv: string[],
  deps?: Partial<RunDeps>
): Promise<number> {
  const {
    execa: execaFn,
    runAnalyze: runAnalyzeFn,
    generateMeta: generateMetaFn,
    getConvexConfig: getConvexConfigFn,
    syncEnv: syncEnvFn,
    loadBetterConvexConfig: loadBetterConvexConfigFn,
    ensureConvexGitignoreEntry: ensureConvexGitignoreEntryFn,
    enableDevSchemaWatch,
    realConvex: realConvexPath,
  } = {
    execa,
    runAnalyze,
    generateMeta,
    getConvexConfig,
    syncEnv,
    loadBetterConvexConfig,
    ensureConvexGitignoreEntry,
    enableDevSchemaWatch: !deps,
    realConvex,
    ...deps,
  };

  const {
    command,
    restArgs,
    convexArgs,
    debug: cliDebug,
    outputDir: cliOutputDir,
    scope: cliScope,
    configPath,
  } = parseArgs(argv);

  if (command === 'dev') {
    if (cliScope) {
      throw new Error(
        '`--scope` is not supported for `better-convex dev`. Use `better-convex codegen --scope <all|auth|orm>` for scoped generation.'
      );
    }
    const config = loadBetterConvexConfigFn(configPath);
    const {
      remainingArgs: devArgsWithoutMigrationFlags,
      overrides: devMigrationOverrides,
    } = extractMigrationCliOptions(convexArgs);
    const { remainingArgs: devCommandArgs, overrides: devBackfillOverrides } =
      extractBackfillCliOptions(devArgsWithoutMigrationFlags);
    const outputDir = cliOutputDir ?? config.outputDir;
    const debug = cliDebug || config.dev.debug;
    const generateApi = config.api;
    const generateAuth = config.auth;
    const convexDevArgs = [...config.dev.convexArgs, ...devCommandArgs];
    const devBackfillConfig = resolveBackfillConfig(
      config.dev.aggregateBackfill,
      devBackfillOverrides
    );
    const devMigrationConfig = resolveMigrationConfig(
      config.dev.migrations,
      devMigrationOverrides
    );
    const { functionsDir } = getConvexConfigFn(outputDir);
    const schemaPath = join(functionsDir, 'schema.ts');
    const deploymentArgs = extractRunDeploymentArgs(convexDevArgs);

    if (!deps) {
      try {
        ensureConvexGitignoreEntryFn(process.cwd());
      } catch (error) {
        console.warn(
          `⚠️  Failed to ensure .convex/ is ignored in .gitignore: ${(error as Error).message}`
        );
      }
    }

    // Initial codegen
    await generateMetaFn(outputDir, {
      debug,
      api: generateApi,
      auth: generateAuth,
    });

    // Spawn watcher as child process
    const isTs = __filename.endsWith('.ts');
    const watcherPath = isTs
      ? join(__dirname, 'watcher.ts')
      : join(__dirname, 'watcher.mjs');
    const runtime = isTs ? 'bun' : process.execPath;

    const watcherProcess = execaFn(runtime, [watcherPath], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        BETTER_CONVEX_API_OUTPUT_DIR: outputDir || '',
        BETTER_CONVEX_DEBUG: debug ? '1' : '',
        BETTER_CONVEX_GENERATE_API: generateApi ? '1' : '0',
        BETTER_CONVEX_GENERATE_AUTH: generateAuth ? '1' : '0',
      },
    });
    processes.push(watcherProcess);

    // Spawn real convex dev
    const convexProcess = execaFn(
      'node',
      [realConvexPath, 'dev', ...convexDevArgs],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
        reject: false, // Don't throw on non-zero exit
      }
    );
    processes.push(convexProcess);

    const backfillAbortController = new AbortController();
    let schemaWatcher: {
      close: () => Promise<void> | void;
      on: (...args: any[]) => any;
    } | null = null;
    let schemaDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let schemaBackfillInFlight: Promise<void> | null = null;
    let schemaBackfillQueued = false;

    const maybeRunSchemaBackfill = async () => {
      try {
        const exitCode = await runDevSchemaBackfillIfNeeded({
          execaFn,
          realConvexPath,
          backfillConfig: devBackfillConfig,
          functionsDir,
          deploymentArgs,
          signal: backfillAbortController.signal,
        });
        if (exitCode !== 0 && !backfillAbortController.signal.aborted) {
          console.warn(
            '⚠️  aggregateBackfill on schema update failed in dev (continuing without blocking).'
          );
        }
      } catch (error) {
        if (!backfillAbortController.signal.aborted) {
          console.warn(
            `⚠️  aggregateBackfill on schema update errored in dev: ${(error as Error).message}`
          );
        }
      }
    };

    const queueSchemaBackfill = () => {
      if (backfillAbortController.signal.aborted) {
        return;
      }
      schemaBackfillQueued = true;
      if (schemaBackfillInFlight) {
        return;
      }
      schemaBackfillInFlight = (async () => {
        while (
          schemaBackfillQueued &&
          !backfillAbortController.signal.aborted
        ) {
          schemaBackfillQueued = false;
          await maybeRunSchemaBackfill();
        }
      })().finally(() => {
        schemaBackfillInFlight = null;
      });
    };

    if (devMigrationConfig.enabled !== 'off') {
      void (async () => {
        try {
          const exitCode = await runMigrationFlow({
            execaFn,
            realConvexPath,
            migrationConfig: devMigrationConfig,
            deploymentArgs,
            signal: backfillAbortController.signal,
            context: 'dev',
            direction: 'up',
          });
          if (exitCode !== 0 && !backfillAbortController.signal.aborted) {
            console.warn(
              '⚠️  migration up failed in dev (continuing without blocking).'
            );
          }
        } catch (error) {
          if (!backfillAbortController.signal.aborted) {
            console.warn(
              `⚠️  migration up errored in dev: ${(error as Error).message}`
            );
          }
        }
      })();
    }

    if (devBackfillConfig.enabled !== 'off') {
      void (async () => {
        try {
          const exitCode = await runAggregateBackfillFlow({
            execaFn,
            realConvexPath,
            backfillConfig: devBackfillConfig,
            mode: 'resume',
            deploymentArgs,
            signal: backfillAbortController.signal,
            context: 'dev',
          });
          if (exitCode !== 0 && !backfillAbortController.signal.aborted) {
            console.warn(
              '⚠️  aggregateBackfill kickoff failed in dev (continuing without blocking).'
            );
          }
        } catch (error) {
          if (!backfillAbortController.signal.aborted) {
            console.warn(
              `⚠️  aggregateBackfill kickoff errored in dev: ${(error as Error).message}`
            );
          }
        }
      })();
    }

    if (
      enableDevSchemaWatch &&
      devBackfillConfig.enabled !== 'off' &&
      fs.existsSync(schemaPath)
    ) {
      const { watch } = await import('chokidar');
      const watchedSchema = watch(schemaPath, {
        ignoreInitial: true,
      }) as any;
      schemaWatcher = watchedSchema;
      watchedSchema
        .on('change', () => {
          if (schemaDebounceTimer) {
            clearTimeout(schemaDebounceTimer);
          }
          schemaDebounceTimer = setTimeout(() => {
            queueSchemaBackfill();
          }, 200);
        })
        .on('error', (error: unknown) => {
          if (!backfillAbortController.signal.aborted) {
            console.warn(
              `⚠️  schema watch error (aggregate backfill): ${(error as Error).message}`
            );
          }
        });
    }

    // Setup cleanup handlers
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      backfillAbortController.abort();
      if (schemaDebounceTimer) {
        clearTimeout(schemaDebounceTimer);
      }
      void schemaWatcher?.close();
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      backfillAbortController.abort();
      if (schemaDebounceTimer) {
        clearTimeout(schemaDebounceTimer);
      }
      void schemaWatcher?.close();
      cleanup();
      process.exit(0);
    });

    // Wait for either to exit, then cleanup
    const result = await Promise.race([
      watcherProcess.catch(() => ({ exitCode: 1 })),
      convexProcess,
    ]);
    backfillAbortController.abort();
    if (schemaDebounceTimer) {
      clearTimeout(schemaDebounceTimer);
    }
    await schemaWatcher?.close();
    cleanup();
    return result.exitCode ?? 0;
  }
  if (command === 'codegen') {
    const config = loadBetterConvexConfigFn(configPath);
    const outputDir = cliOutputDir ?? config.outputDir;
    const debug = cliDebug || config.codegen.debug;
    const convexCodegenArgs = [...config.codegen.convexArgs, ...convexArgs];
    const scope = cliScope ?? config.codegen.scope;

    // Run better-convex codegen first
    if (scope) {
      await generateMetaFn(outputDir, { debug, scope });
    } else {
      const derivedScope = deriveScopeFromToggles(config.api, config.auth);
      if (derivedScope) {
        await generateMetaFn(outputDir, { debug, scope: derivedScope });
      } else {
        await generateMetaFn(outputDir, {
          debug,
          api: config.api,
          auth: config.auth,
        });
      }
    }

    // Then run real convex codegen
    const result = await execaFn(
      'node',
      [realConvexPath, 'codegen', ...convexCodegenArgs],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
      }
    );
    return result.exitCode ?? 0;
  }
  if (command === 'env') {
    const subcommand = convexArgs[0];

    if (subcommand === 'sync') {
      // better-convex env sync [--auth] [--force] [--prod]
      const auth = restArgs.includes('--auth');
      const force = restArgs.includes('--force');
      const prod = restArgs.includes('--prod');
      await syncEnvFn({ auth, force, prod });
      return 0;
    }
    // Pass through to convex env (list, get, set, remove)
    const result = await execaFn(
      'node',
      [realConvexPath, 'env', ...convexArgs],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
        reject: false,
      }
    );
    return result.exitCode ?? 0;
  }
  if (command === 'analyze') {
    return runAnalyzeFn(restArgs);
  }
  if (command === 'reset') {
    const {
      confirmed,
      beforeHook,
      afterHook,
      remainingArgs: resetCommandArgs,
    } = extractResetCliOptions(convexArgs);
    if (!confirmed) {
      throw new Error(
        '`better-convex reset` is destructive. Re-run with `--yes`.'
      );
    }

    const config = loadBetterConvexConfigFn(configPath);
    const resetArgs = [...config.deploy.convexArgs, ...resetCommandArgs];
    const deploymentArgs = extractRunDeploymentArgs(resetArgs);

    const runOptionalHook = async (functionName: string | undefined) => {
      if (!functionName) {
        return 0;
      }
      const result = await runConvexFunction(
        execaFn,
        realConvexPath,
        functionName,
        {},
        deploymentArgs
      );
      return result.exitCode;
    };

    const beforeExitCode = await runOptionalHook(beforeHook);
    if (beforeExitCode !== 0) {
      return beforeExitCode;
    }

    const resetResult = await runConvexFunction(
      execaFn,
      realConvexPath,
      'generated/server:reset',
      {},
      deploymentArgs
    );
    if (resetResult.exitCode !== 0) {
      return resetResult.exitCode;
    }

    const backfillExitCode = await runAggregateBackfillFlow({
      execaFn,
      realConvexPath,
      backfillConfig: {
        enabled: 'on',
        wait: true,
        batchSize: 1000,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: false,
      },
      mode: 'resume',
      deploymentArgs,
      context: 'aggregate',
    });
    if (backfillExitCode !== 0) {
      return backfillExitCode;
    }

    return runOptionalHook(afterHook);
  }
  if (command === 'deploy') {
    const config = loadBetterConvexConfigFn(configPath);
    const {
      remainingArgs: deployArgsWithoutMigrationFlags,
      overrides: deployMigrationOverrides,
    } = extractMigrationCliOptions(convexArgs);
    const {
      remainingArgs: deployCommandArgs,
      overrides: deployBackfillOverrides,
    } = extractBackfillCliOptions(deployArgsWithoutMigrationFlags);
    const deployArgs = [...config.deploy.convexArgs, ...deployCommandArgs];
    const deployResult = await execaFn(
      'node',
      [realConvexPath, 'deploy', ...deployArgs],
      {
        stdio: 'inherit',
        cwd: process.cwd(),
        reject: false,
      }
    );
    if ((deployResult.exitCode ?? 1) !== 0) {
      return deployResult.exitCode ?? 1;
    }

    const migrationConfig = resolveMigrationConfig(
      config.deploy.migrations,
      deployMigrationOverrides
    );
    const backfillConfig = resolveBackfillConfig(
      config.deploy.aggregateBackfill,
      deployBackfillOverrides
    );
    const deploymentArgs = extractRunDeploymentArgs(deployArgs);

    const migrationExitCode = await runMigrationFlow({
      execaFn,
      realConvexPath,
      migrationConfig,
      deploymentArgs,
      context: 'deploy',
      direction: 'up',
    });
    if (migrationExitCode !== 0) {
      return migrationExitCode;
    }

    return runAggregateBackfillFlow({
      execaFn,
      realConvexPath,
      backfillConfig,
      mode: 'resume',
      deploymentArgs,
      context: 'deploy',
    });
  }
  if (command === 'migrate') {
    const subcommand = restArgs[0];
    if (
      subcommand !== 'create' &&
      subcommand !== 'up' &&
      subcommand !== 'down' &&
      subcommand !== 'status' &&
      subcommand !== 'cancel'
    ) {
      throw new Error(
        'Unknown migrate command. Use: `better-convex migrate create|up|down|status|cancel`.'
      );
    }

    const config = loadBetterConvexConfigFn(configPath);

    if (subcommand === 'create') {
      const rawName = restArgs.slice(1).join(' ').trim();
      if (!rawName) {
        throw new Error(
          'Missing migration name. Usage: `better-convex migrate create <name>`.'
        );
      }
      const outputDir = cliOutputDir ?? config.outputDir;
      const { functionsDir } = getConvexConfigFn(outputDir);
      await runMigrationCreate({
        migrationName: rawName,
        functionsDir,
      });
      return 0;
    }

    const {
      remainingArgs: migrationCommandArgs,
      overrides: migrationOverrides,
    } = extractMigrationCliOptions(restArgs.slice(1));
    const migrationConfig = {
      ...resolveMigrationConfig(config.deploy.migrations, migrationOverrides),
      enabled: 'on' as const,
    };
    const commandArgs = [...config.deploy.convexArgs, ...migrationCommandArgs];
    const deploymentArgs = extractRunDeploymentArgs(commandArgs);

    if (subcommand === 'up') {
      return runMigrationFlow({
        execaFn,
        realConvexPath,
        migrationConfig,
        deploymentArgs,
        context: 'migration',
        direction: 'up',
      });
    }

    if (subcommand === 'down') {
      const { remainingArgs, steps, to } =
        extractMigrationDownOptions(commandArgs);
      const downDeploymentArgs = extractRunDeploymentArgs(remainingArgs);
      return runMigrationFlow({
        execaFn,
        realConvexPath,
        migrationConfig,
        deploymentArgs: downDeploymentArgs,
        context: 'migration',
        direction: 'down',
        steps,
        to,
      });
    }

    if (subcommand === 'status') {
      const statusResult = await runConvexFunction(
        execaFn,
        realConvexPath,
        'generated/server:migrationStatus',
        {},
        deploymentArgs
      );
      return statusResult.exitCode;
    }

    let runId: string | undefined;
    const cancelArgs: string[] = [];
    for (let i = 0; i < commandArgs.length; i += 1) {
      const arg = commandArgs[i];
      if (arg === '--run-id') {
        const { value, nextIndex } = readFlagValue(commandArgs, i, '--run-id');
        runId = value;
        i = nextIndex;
        continue;
      }
      if (arg.startsWith('--run-id=')) {
        const value = arg.slice('--run-id='.length);
        if (!value) {
          throw new Error('Missing value for --run-id.');
        }
        runId = value;
        continue;
      }
      cancelArgs.push(arg);
    }
    const cancelDeploymentArgs = extractRunDeploymentArgs(cancelArgs);
    const cancelResult = await runConvexFunction(
      execaFn,
      realConvexPath,
      'generated/server:migrationCancel',
      runId ? { runId } : {},
      cancelDeploymentArgs
    );
    return cancelResult.exitCode;
  }
  if (command === 'aggregate') {
    const subcommand = restArgs[0];
    if (
      subcommand !== 'rebuild' &&
      subcommand !== 'backfill' &&
      subcommand !== 'prune'
    ) {
      throw new Error(
        'Unknown aggregate command. Use: `better-convex aggregate backfill`, `better-convex aggregate rebuild`, or `better-convex aggregate prune`.'
      );
    }

    const config = loadBetterConvexConfigFn(configPath);
    const {
      remainingArgs: aggregateCommandArgs,
      overrides: aggregateBackfillOverrides,
    } = extractBackfillCliOptions(restArgs.slice(1));
    const aggregateArgs = [
      ...config.deploy.convexArgs,
      ...aggregateCommandArgs,
    ];
    const backfillConfig = {
      ...resolveBackfillConfig(
        config.deploy.aggregateBackfill,
        aggregateBackfillOverrides
      ),
      enabled: 'on' as const,
    };
    const deploymentArgs = extractRunDeploymentArgs(aggregateArgs);
    if (subcommand === 'prune') {
      return runAggregatePruneFlow({
        execaFn,
        realConvexPath,
        deploymentArgs,
      });
    }

    return runAggregateBackfillFlow({
      execaFn,
      realConvexPath,
      backfillConfig,
      mode: subcommand === 'rebuild' ? 'rebuild' : 'resume',
      deploymentArgs,
      context: 'aggregate',
    });
  }
  // Pass through to real convex CLI
  const result = await execaFn(
    'node',
    [realConvexPath, command, ...convexArgs],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      reject: false,
    }
  );
  return result.exitCode ?? 0;
}

export function isEntryPoint(
  entry: string | undefined,
  filename: string
): boolean {
  if (!entry) return false;
  // bin shims are often symlinks (e.g. node_modules/.bin/better-convex).
  // Comparing resolved paths without dereferencing symlinks makes the CLI no-op.
  try {
    return (
      resolve(fs.realpathSync(entry)) === resolve(fs.realpathSync(filename))
    );
  } catch {
    return resolve(entry) === resolve(filename);
  }
}

// Only run when executed directly (not when imported for tests).
const isMain = isEntryPoint(process.argv[1], __filename);

if (isMain) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      cleanup();
      console.error('Error:', error);
      process.exit(1);
    }
  );
}
