import fs from 'node:fs';
import path from 'node:path';
import type { CodegenScope } from './codegen.js';

const DEFAULT_CONFIG_PATH = 'better-convex.json';

const CODEGEN_SCOPES = new Set<CodegenScope>(['all', 'auth', 'orm']);
const BACKFILL_ENABLED_VALUES = new Set(['auto', 'on', 'off']);

export type BackfillEnabled = 'auto' | 'on' | 'off';

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
  api: boolean;
  auth: boolean;
  outputDir: string;
  dev: {
    debug: boolean;
    convexArgs: string[];
    aggregateBackfill: AggregateBackfillConfig;
    migrations: MigrationConfig;
  };
  codegen: {
    debug: boolean;
    convexArgs: string[];
    scope?: CodegenScope;
  };
  deploy: {
    convexArgs: string[];
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
    api: true,
    auth: true,
    outputDir: 'convex/shared',
    dev: {
      debug: false,
      convexArgs: [],
      aggregateBackfill: devBackfillDefaults,
      migrations: devMigrationDefaults,
    },
    codegen: {
      debug: false,
      convexArgs: [],
    },
    deploy: {
      convexArgs: [],
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

function parseString(
  value: unknown,
  fieldName: string,
  configPath: string
): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new Error(
    `Invalid ${fieldName} in ${configPath}: expected non-empty string.`
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

function parseCommandConfig(
  value: unknown,
  fieldName: 'dev' | 'codegen',
  configPath: string
): {
  debug?: boolean;
  convexArgs?: string[];
  scope?: CodegenScope;
  aggregateBackfill?: Partial<AggregateBackfillConfig>;
  migrations?: Partial<MigrationConfig>;
} {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${fieldName} in ${configPath}: expected object.`);
  }

  const parsed: {
    debug?: boolean;
    convexArgs?: string[];
    scope?: CodegenScope;
    aggregateBackfill?: Partial<AggregateBackfillConfig>;
    migrations?: Partial<MigrationConfig>;
  } = {};

  if ('debug' in value) {
    parsed.debug = parseBoolean(value.debug, `${fieldName}.debug`, configPath);
  }

  if ('convexArgs' in value) {
    parsed.convexArgs = parseStringArray(
      value.convexArgs,
      `${fieldName}.convexArgs`,
      configPath
    );
  }

  if (
    fieldName === 'codegen' &&
    'scope' in value &&
    value.scope !== undefined
  ) {
    parsed.scope = parseScope(value.scope, `${fieldName}.scope`, configPath);
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
  convexArgs?: string[];
  aggregateBackfill?: Partial<AggregateBackfillConfig>;
  migrations?: Partial<MigrationConfig>;
} {
  if (!isRecord(value)) {
    throw new Error(`Invalid deploy in ${configPath}: expected object.`);
  }

  const parsed: {
    convexArgs?: string[];
    aggregateBackfill?: Partial<AggregateBackfillConfig>;
    migrations?: Partial<MigrationConfig>;
  } = {};

  if ('convexArgs' in value) {
    parsed.convexArgs = parseStringArray(
      value.convexArgs,
      'deploy.convexArgs',
      configPath
    );
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

export function loadBetterConvexConfig(
  configPathArg?: string
): BetterConvexConfig {
  const resolvedConfigPath = path.resolve(
    process.cwd(),
    configPathArg ?? DEFAULT_CONFIG_PATH
  );
  const hasExplicitConfigPath = typeof configPathArg === 'string';

  if (!fs.existsSync(resolvedConfigPath)) {
    if (hasExplicitConfigPath) {
      throw new Error(`Config file not found: ${resolvedConfigPath}`);
    }
    return createDefaultConfig();
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(fs.readFileSync(resolvedConfigPath, 'utf-8'));
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

  const config = createDefaultConfig();

  if ('api' in rawConfig) {
    config.api = parseBoolean(rawConfig.api, 'api', resolvedConfigPath);
  }

  if ('auth' in rawConfig) {
    config.auth = parseBoolean(rawConfig.auth, 'auth', resolvedConfigPath);
  }

  if ('outputDir' in rawConfig) {
    config.outputDir = parseString(
      rawConfig.outputDir,
      'outputDir',
      resolvedConfigPath
    );
  }

  if ('dev' in rawConfig) {
    const parsed = parseCommandConfig(rawConfig.dev, 'dev', resolvedConfigPath);
    if (parsed.debug !== undefined) {
      config.dev.debug = parsed.debug;
    }
    if (parsed.convexArgs !== undefined) {
      config.dev.convexArgs = parsed.convexArgs;
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

  if ('codegen' in rawConfig) {
    const parsed = parseCommandConfig(
      rawConfig.codegen,
      'codegen',
      resolvedConfigPath
    );
    if (parsed.debug !== undefined) {
      config.codegen.debug = parsed.debug;
    }
    if (parsed.convexArgs !== undefined) {
      config.codegen.convexArgs = parsed.convexArgs;
    }
    if (parsed.scope !== undefined) {
      config.codegen.scope = parsed.scope;
    }
  }

  if ('deploy' in rawConfig) {
    const parsed = parseDeployConfig(rawConfig.deploy, resolvedConfigPath);
    if (parsed.convexArgs !== undefined) {
      config.deploy.convexArgs = parsed.convexArgs;
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
