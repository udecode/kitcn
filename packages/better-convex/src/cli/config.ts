import fs from 'node:fs';
import path from 'node:path';
import type { CodegenScope } from './codegen.js';

const DEFAULT_JSON_CONFIG_PATH = 'concave.json';
const LEGACY_JSON_CONFIG_PATH = 'better-convex.json';

const CODEGEN_SCOPES = new Set<CodegenScope>(['all', 'auth', 'orm']);
const BACKFILL_ENABLED_VALUES = new Set(['auto', 'on', 'off']);
const BACKEND_VALUES = new Set<BetterConvexBackend>(['convex', 'concave']);

export type BackfillEnabled = 'auto' | 'on' | 'off';
export type BetterConvexBackend = 'convex' | 'concave';
export type BetterConvexPathsConfig = {
  lib: string;
  shared: string;
  env?: string;
};

export type AggregateBackfillConfig = {
  enabled: BackfillEnabled;
  wait: boolean;
  batchSize: number;
  pollIntervalMs: number;
  timeoutMs: number;
  strict: boolean;
};

export type MigrationConfig = {
  enabled: BackfillEnabled;
  wait: boolean;
  batchSize: number;
  pollIntervalMs: number;
  timeoutMs: number;
  strict: boolean;
  allowDrift: boolean;
};

export type BetterConvexConfig = {
  backend: BetterConvexBackend;
  paths: BetterConvexPathsConfig;
  hooks: {
    postAdd: string[];
  };
  dev: {
    debug: boolean;
    args: string[];
    aggregateBackfill: AggregateBackfillConfig;
    migrations: MigrationConfig;
  };
  codegen: {
    debug: boolean;
    args: string[];
    scope?: CodegenScope;
    trimSegments: string[];
  };
  deploy: {
    args: string[];
    aggregateBackfill: AggregateBackfillConfig;
    migrations: MigrationConfig;
  };
};

function createDefaultConfig(): BetterConvexConfig {
  const devBackfillDefaults: AggregateBackfillConfig = {
    enabled: 'auto',
    wait: true,
    batchSize: 1000,
    pollIntervalMs: 1000,
    timeoutMs: 900_000,
    strict: false,
  };
  const deployBackfillDefaults: AggregateBackfillConfig = {
    enabled: 'auto',
    wait: true,
    batchSize: 1000,
    pollIntervalMs: 1000,
    timeoutMs: 900_000,
    strict: true,
  };
  const devMigrationDefaults: MigrationConfig = {
    enabled: 'auto',
    wait: true,
    batchSize: 256,
    pollIntervalMs: 1000,
    timeoutMs: 900_000,
    strict: false,
    allowDrift: true,
  };
  const deployMigrationDefaults: MigrationConfig = {
    enabled: 'auto',
    wait: true,
    batchSize: 256,
    pollIntervalMs: 1000,
    timeoutMs: 900_000,
    strict: true,
    allowDrift: false,
  };
  return {
    backend: 'convex',
    paths: {
      lib: 'convex/lib',
      shared: 'convex/shared',
    },
    hooks: {
      postAdd: [],
    },
    dev: {
      debug: false,
      args: [],
      aggregateBackfill: devBackfillDefaults,
      migrations: devMigrationDefaults,
    },
    codegen: {
      debug: false,
      args: [],
      trimSegments: ['plugins'],
    },
    deploy: {
      args: [],
      aggregateBackfill: deployBackfillDefaults,
      migrations: deployMigrationDefaults,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBoolean(
  value: unknown,
  fieldName: string,
  configPath: string
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  throw new Error(
    `Invalid ${fieldName} in ${configPath}: expected boolean, got ${typeof value}.`
  );
}

function parseStringArray(
  value: unknown,
  fieldName: string,
  configPath: string
): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new Error(
      `Invalid ${fieldName} in ${configPath}: expected string array.`
    );
  }
  return [...value];
}

function parseTrimSegments(
  value: unknown,
  fieldName: string,
  configPath: string
): string[] {
  const segments = parseStringArray(value, fieldName, configPath)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  for (const segment of segments) {
    if (segment.includes('/') || segment.includes('\\')) {
      throw new Error(
        `Invalid ${fieldName} in ${configPath}: segment "${segment}" must not contain path separators.`
      );
    }
  }

  return [...new Set(segments)];
}

function parsePositiveInteger(
  value: unknown,
  fieldName: string,
  configPath: string
): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new Error(
    `Invalid ${fieldName} in ${configPath}: expected a positive integer.`
  );
}

function parseSafeRelativePath(
  value: unknown,
  fieldName: string,
  configPath: string
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `Invalid ${fieldName} in ${configPath}: expected non-empty string.`
    );
  }
  if (value.includes('\0')) {
    throw new Error(
      `Invalid ${fieldName} in ${configPath}: null byte is not allowed.`
    );
  }
  if (path.isAbsolute(value)) {
    throw new Error(
      `Invalid ${fieldName} in ${configPath}: absolute paths are not allowed.`
    );
  }
  const normalizedPosix = path.posix.normalize(value.replace(/\\/g, '/'));
  if (
    normalizedPosix === '..' ||
    normalizedPosix.startsWith('../') ||
    normalizedPosix.startsWith('/')
  ) {
    throw new Error(
      `Invalid ${fieldName} in ${configPath}: path traversal is not allowed.`
    );
  }
  return normalizedPosix;
}

function parseScope(
  value: unknown,
  fieldName: string,
  configPath: string
): CodegenScope {
  if (typeof value === 'string' && CODEGEN_SCOPES.has(value as CodegenScope)) {
    return value as CodegenScope;
  }
  throw new Error(
    `Invalid ${fieldName} in ${configPath}: expected one of all, auth, orm.`
  );
}

function parseBackend(
  value: unknown,
  fieldName: string,
  configPath: string
): BetterConvexBackend {
  if (
    typeof value === 'string' &&
    BACKEND_VALUES.has(value as BetterConvexBackend)
  ) {
    return value as BetterConvexBackend;
  }
  throw new Error(
    `Invalid ${fieldName} in ${configPath}: expected one of convex, concave.`
  );
}

function parseBackfillEnabled(
  value: unknown,
  fieldName: string,
  configPath: string
): BackfillEnabled {
  if (value === true) {
    return 'on';
  }
  if (value === false) {
    return 'off';
  }
  if (
    typeof value === 'string' &&
    BACKFILL_ENABLED_VALUES.has(value as BackfillEnabled)
  ) {
    return value as BackfillEnabled;
  }
  throw new Error(
    `Invalid ${fieldName} in ${configPath}: expected boolean or one of auto, on, off.`
  );
}

function parseAggregateBackfillConfig(
  value: unknown,
  fieldName: string,
  configPath: string
): Partial<AggregateBackfillConfig> {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${fieldName} in ${configPath}: expected object.`);
  }
  assertNoUnknownKeys(
    value,
    ['enabled', 'wait', 'batchSize', 'pollIntervalMs', 'timeoutMs', 'strict'],
    configPath,
    fieldName
  );

  const parsed: Partial<AggregateBackfillConfig> = {};

  if ('enabled' in value) {
    parsed.enabled = parseBackfillEnabled(
      value.enabled,
      `${fieldName}.enabled`,
      configPath
    );
  }
  if ('wait' in value) {
    parsed.wait = parseBoolean(value.wait, `${fieldName}.wait`, configPath);
  }
  if ('batchSize' in value) {
    parsed.batchSize = parsePositiveInteger(
      value.batchSize,
      `${fieldName}.batchSize`,
      configPath
    );
  }
  if ('pollIntervalMs' in value) {
    parsed.pollIntervalMs = parsePositiveInteger(
      value.pollIntervalMs,
      `${fieldName}.pollIntervalMs`,
      configPath
    );
  }
  if ('timeoutMs' in value) {
    parsed.timeoutMs = parsePositiveInteger(
      value.timeoutMs,
      `${fieldName}.timeoutMs`,
      configPath
    );
  }
  if ('strict' in value) {
    parsed.strict = parseBoolean(
      value.strict,
      `${fieldName}.strict`,
      configPath
    );
  }

  return parsed;
}

function parseMigrationConfig(
  value: unknown,
  fieldName: string,
  configPath: string
): Partial<MigrationConfig> {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${fieldName} in ${configPath}: expected object.`);
  }
  assertNoUnknownKeys(
    value,
    [
      'enabled',
      'wait',
      'batchSize',
      'pollIntervalMs',
      'timeoutMs',
      'strict',
      'allowDrift',
    ],
    configPath,
    fieldName
  );

  const parsed: Partial<MigrationConfig> = {};

  if ('enabled' in value) {
    parsed.enabled = parseBackfillEnabled(
      value.enabled,
      `${fieldName}.enabled`,
      configPath
    );
  }
  if ('wait' in value) {
    parsed.wait = parseBoolean(value.wait, `${fieldName}.wait`, configPath);
  }
  if ('batchSize' in value) {
    parsed.batchSize = parsePositiveInteger(
      value.batchSize,
      `${fieldName}.batchSize`,
      configPath
    );
  }
  if ('pollIntervalMs' in value) {
    parsed.pollIntervalMs = parsePositiveInteger(
      value.pollIntervalMs,
      `${fieldName}.pollIntervalMs`,
      configPath
    );
  }
  if ('timeoutMs' in value) {
    parsed.timeoutMs = parsePositiveInteger(
      value.timeoutMs,
      `${fieldName}.timeoutMs`,
      configPath
    );
  }
  if ('strict' in value) {
    parsed.strict = parseBoolean(
      value.strict,
      `${fieldName}.strict`,
      configPath
    );
  }
  if ('allowDrift' in value) {
    parsed.allowDrift = parseBoolean(
      value.allowDrift,
      `${fieldName}.allowDrift`,
      configPath
    );
  }

  return parsed;
}

function assertNoUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  configPath: string,
  scope?: string
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) {
      continue;
    }
    const qualifiedKey = scope ? `${scope}.${key}` : key;
    throw new Error(`Unknown config key "${qualifiedKey}" in ${configPath}.`);
  }
}

function parseCommandConfig(
  value: unknown,
  fieldName: 'dev' | 'codegen',
  configPath: string
): {
  debug?: boolean;
  args?: string[];
  scope?: CodegenScope;
  trimSegments?: string[];
  aggregateBackfill?: Partial<AggregateBackfillConfig>;
  migrations?: Partial<MigrationConfig>;
} {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${fieldName} in ${configPath}: expected object.`);
  }
  assertNoUnknownKeys(
    value,
    fieldName === 'dev'
      ? ['debug', 'args', 'aggregateBackfill', 'migrations']
      : ['debug', 'args', 'scope', 'trimSegments'],
    configPath,
    fieldName
  );

  const parsed: {
    debug?: boolean;
    args?: string[];
    scope?: CodegenScope;
    trimSegments?: string[];
    aggregateBackfill?: Partial<AggregateBackfillConfig>;
    migrations?: Partial<MigrationConfig>;
  } = {};

  if ('debug' in value) {
    parsed.debug = parseBoolean(value.debug, `${fieldName}.debug`, configPath);
  }

  if ('args' in value) {
    parsed.args = parseStringArray(value.args, `${fieldName}.args`, configPath);
  }

  if (
    fieldName === 'codegen' &&
    'scope' in value &&
    value.scope !== undefined
  ) {
    parsed.scope = parseScope(value.scope, `${fieldName}.scope`, configPath);
  }
  if (
    fieldName === 'codegen' &&
    'trimSegments' in value &&
    value.trimSegments !== undefined
  ) {
    parsed.trimSegments = parseTrimSegments(
      value.trimSegments,
      `${fieldName}.trimSegments`,
      configPath
    );
  }

  if (
    fieldName === 'dev' &&
    'aggregateBackfill' in value &&
    value.aggregateBackfill !== undefined
  ) {
    parsed.aggregateBackfill = parseAggregateBackfillConfig(
      value.aggregateBackfill,
      `${fieldName}.aggregateBackfill`,
      configPath
    );
  }
  if (
    fieldName === 'dev' &&
    'migrations' in value &&
    value.migrations !== undefined
  ) {
    parsed.migrations = parseMigrationConfig(
      value.migrations,
      `${fieldName}.migrations`,
      configPath
    );
  }

  return parsed;
}

function parseDeployConfig(
  value: unknown,
  configPath: string
): {
  args?: string[];
  aggregateBackfill?: Partial<AggregateBackfillConfig>;
  migrations?: Partial<MigrationConfig>;
} {
  if (!isRecord(value)) {
    throw new Error(`Invalid deploy in ${configPath}: expected object.`);
  }
  assertNoUnknownKeys(
    value,
    ['args', 'aggregateBackfill', 'migrations'],
    configPath,
    'deploy'
  );

  const parsed: {
    args?: string[];
    aggregateBackfill?: Partial<AggregateBackfillConfig>;
    migrations?: Partial<MigrationConfig>;
  } = {};

  if ('args' in value) {
    parsed.args = parseStringArray(value.args, 'deploy.args', configPath);
  }

  if ('aggregateBackfill' in value && value.aggregateBackfill !== undefined) {
    parsed.aggregateBackfill = parseAggregateBackfillConfig(
      value.aggregateBackfill,
      'deploy.aggregateBackfill',
      configPath
    );
  }
  if ('migrations' in value && value.migrations !== undefined) {
    parsed.migrations = parseMigrationConfig(
      value.migrations,
      'deploy.migrations',
      configPath
    );
  }

  return parsed;
}

function parseHooksConfig(
  value: unknown,
  configPath: string
): {
  postAdd?: string[];
} {
  if (!isRecord(value)) {
    throw new Error(`Invalid hooks in ${configPath}: expected object.`);
  }
  assertNoUnknownKeys(value, ['postAdd'], configPath, 'hooks');

  const parsed: {
    postAdd?: string[];
  } = {};

  if ('postAdd' in value && value.postAdd !== undefined) {
    const postAdd = parseStringArray(value.postAdd, 'hooks.postAdd', configPath)
      .map((script) => script.trim())
      .filter((script) => script.length > 0);
    parsed.postAdd = postAdd;
  }

  return parsed;
}

function parsePathsConfig(
  value: unknown,
  configPath: string
): Partial<BetterConvexPathsConfig> {
  if (!isRecord(value)) {
    throw new Error(`Invalid paths in ${configPath}: expected object.`);
  }
  assertNoUnknownKeys(value, ['lib', 'shared', 'env'], configPath, 'paths');

  const parsed: Partial<BetterConvexPathsConfig> = {};
  if ('lib' in value && value.lib !== undefined) {
    parsed.lib = parseSafeRelativePath(value.lib, 'paths.lib', configPath);
  }
  if ('shared' in value && value.shared !== undefined) {
    parsed.shared = parseSafeRelativePath(
      value.shared,
      'paths.shared',
      configPath
    );
  }
  if ('env' in value && value.env !== undefined) {
    parsed.env = parseSafeRelativePath(value.env, 'paths.env', configPath);
  }
  return parsed;
}

function resolveDefaultConfigPath(configPathArg?: string): {
  resolvedPath: string | null;
  explicit: boolean;
  legacyPath: string | null;
} {
  if (typeof configPathArg === 'string') {
    return {
      resolvedPath: path.resolve(process.cwd(), configPathArg),
      explicit: true,
      legacyPath: null,
    };
  }

  const jsonPath = path.resolve(process.cwd(), DEFAULT_JSON_CONFIG_PATH);
  if (fs.existsSync(jsonPath)) {
    return { resolvedPath: jsonPath, explicit: false, legacyPath: null };
  }

  const legacyPath = path.resolve(process.cwd(), LEGACY_JSON_CONFIG_PATH);
  if (fs.existsSync(legacyPath)) {
    return { resolvedPath: null, explicit: false, legacyPath };
  }

  return { resolvedPath: null, explicit: false, legacyPath: null };
}

function loadRawConfigFile(resolvedConfigPath: string): unknown {
  const extension = path.extname(resolvedConfigPath).toLowerCase();
  if (extension !== '.json') {
    throw new Error(
      `Only JSON config files are supported. Received: ${resolvedConfigPath}`
    );
  }
  return JSON.parse(fs.readFileSync(resolvedConfigPath, 'utf-8'));
}

export function loadBetterConvexConfig(
  configPathArg?: string
): BetterConvexConfig {
  const {
    resolvedPath: resolvedConfigPath,
    explicit: hasExplicitConfigPath,
    legacyPath,
  } = resolveDefaultConfigPath(configPathArg);

  if (!hasExplicitConfigPath && legacyPath) {
    throw new Error(
      `Legacy config file ${LEGACY_JSON_CONFIG_PATH} is no longer supported. Use ${DEFAULT_JSON_CONFIG_PATH} with meta["better-convex"].`
    );
  }

  if (!resolvedConfigPath || !fs.existsSync(resolvedConfigPath)) {
    if (hasExplicitConfigPath) {
      throw new Error(
        `Config file not found: ${resolvedConfigPath ?? String(configPathArg)}`
      );
    }
    return createDefaultConfig();
  }

  let rawConfig: unknown;
  try {
    rawConfig = loadRawConfigFile(resolvedConfigPath);
  } catch (error) {
    throw new Error(
      `Failed to parse config file ${resolvedConfigPath}: ${(error as Error).message}`
    );
  }

  if (!isRecord(rawConfig)) {
    throw new Error(
      `Invalid config file ${resolvedConfigPath}: expected top-level object.`
    );
  }

  const rawMeta = rawConfig.meta;
  if (rawMeta !== undefined && !isRecord(rawMeta)) {
    throw new Error(
      `Invalid meta in ${resolvedConfigPath}: expected object when provided.`
    );
  }

  const betterConvexConfig = isRecord(rawMeta)
    ? rawMeta['better-convex']
    : undefined;

  if (betterConvexConfig === undefined) {
    if (hasExplicitConfigPath) {
      throw new Error(
        `Missing meta["better-convex"] in ${resolvedConfigPath}.`
      );
    }
    return createDefaultConfig();
  }

  if (!isRecord(betterConvexConfig)) {
    throw new Error(
      `Invalid meta["better-convex"] in ${resolvedConfigPath}: expected object.`
    );
  }

  const parsedConfig = betterConvexConfig;
  assertNoUnknownKeys(
    parsedConfig,
    ['backend', 'paths', 'hooks', 'dev', 'codegen', 'deploy'],
    resolvedConfigPath,
    'meta["better-convex"]'
  );

  const config = createDefaultConfig();

  if ('backend' in parsedConfig && parsedConfig.backend !== undefined) {
    config.backend = parseBackend(
      parsedConfig.backend,
      'meta["better-convex"].backend',
      resolvedConfigPath
    );
  }

  if ('hooks' in parsedConfig && parsedConfig.hooks !== undefined) {
    const parsed = parseHooksConfig(parsedConfig.hooks, resolvedConfigPath);
    if (parsed.postAdd !== undefined) {
      config.hooks.postAdd = parsed.postAdd;
    }
  }

  if ('paths' in parsedConfig && parsedConfig.paths !== undefined) {
    const parsed = parsePathsConfig(parsedConfig.paths, resolvedConfigPath);
    if (parsed.lib !== undefined) {
      config.paths.lib = parsed.lib;
    }
    if (parsed.shared !== undefined) {
      config.paths.shared = parsed.shared;
    }
    if (parsed.env !== undefined) {
      config.paths.env = parsed.env;
    }
  }

  if ('dev' in parsedConfig) {
    const parsed = parseCommandConfig(
      parsedConfig.dev,
      'dev',
      resolvedConfigPath
    );
    if (parsed.debug !== undefined) {
      config.dev.debug = parsed.debug;
    }
    if (parsed.args !== undefined) {
      config.dev.args = parsed.args;
    }
    if (parsed.aggregateBackfill !== undefined) {
      config.dev.aggregateBackfill = {
        ...config.dev.aggregateBackfill,
        ...parsed.aggregateBackfill,
      };
    }
    if (parsed.migrations !== undefined) {
      config.dev.migrations = {
        ...config.dev.migrations,
        ...parsed.migrations,
      };
    }
  }

  if ('codegen' in parsedConfig) {
    const parsed = parseCommandConfig(
      parsedConfig.codegen,
      'codegen',
      resolvedConfigPath
    );
    if (parsed.debug !== undefined) {
      config.codegen.debug = parsed.debug;
    }
    if (parsed.args !== undefined) {
      config.codegen.args = parsed.args;
    }
    if (parsed.scope !== undefined) {
      config.codegen.scope = parsed.scope;
    }
    if (parsed.trimSegments !== undefined) {
      config.codegen.trimSegments = parsed.trimSegments;
    }
  }

  if ('deploy' in parsedConfig) {
    const parsed = parseDeployConfig(parsedConfig.deploy, resolvedConfigPath);
    if (parsed.args !== undefined) {
      config.deploy.args = parsed.args;
    }
    if (parsed.aggregateBackfill !== undefined) {
      config.deploy.aggregateBackfill = {
        ...config.deploy.aggregateBackfill,
        ...parsed.aggregateBackfill,
      };
    }
    if (parsed.migrations !== undefined) {
      config.deploy.migrations = {
        ...config.deploy.migrations,
        ...parsed.migrations,
      };
    }
  }

  return config;
}
