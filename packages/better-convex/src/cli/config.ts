import fs from 'node:fs';
import path from 'node:path';
import type { CodegenScope } from './codegen.js';

const DEFAULT_CONFIG_PATH = 'better-convex.json';

const CODEGEN_SCOPES = new Set<CodegenScope>(['all', 'auth', 'orm']);

export type BetterConvexConfig = {
  api: boolean;
  auth: boolean;
  outputDir: string;
  dev: {
    debug: boolean;
    convexArgs: string[];
  };
  codegen: {
    debug: boolean;
    convexArgs: string[];
    scope?: CodegenScope;
  };
};

function createDefaultConfig(): BetterConvexConfig {
  return {
    api: true,
    auth: true,
    outputDir: 'convex/shared',
    dev: {
      debug: false,
      convexArgs: [],
    },
    codegen: {
      debug: false,
      convexArgs: [],
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

function parseCommandConfig(
  value: unknown,
  fieldName: 'dev' | 'codegen',
  configPath: string
): {
  debug?: boolean;
  convexArgs?: string[];
  scope?: CodegenScope;
} {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${fieldName} in ${configPath}: expected object.`);
  }

  const parsed: {
    debug?: boolean;
    convexArgs?: string[];
    scope?: CodegenScope;
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

  return config;
}
