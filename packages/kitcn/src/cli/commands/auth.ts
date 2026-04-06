import path from 'node:path';
import {
  createBackendAdapter,
  extractBackendRunTargetArgs,
  parseArgs,
  parseBackendRunJson,
  type RunDeps,
  resolveConfiguredBackend,
  resolveRunDeps,
  runBackendFunction,
} from '../backend-core.js';
import { resolveAuthEnvState, serializeEnvValue } from '../env.js';
import { logger } from '../utils/logger.js';

const HELP_FLAGS = new Set(['--help', '-h']);
const AUTH_JWKS_FUNCTION = 'generated/auth:getLatestJwks';
const AUTH_ROTATE_KEYS_FUNCTION = 'generated/auth:rotateKeys';

export const AUTH_HELP_TEXT = `Usage: kitcn auth jwks [options]

Commands:
  jwks                       Print a manual JWKS env payload from the auth runtime

Options:
  --rotate                   Rotate auth keys before fetching JWKS
  --json                     Machine-readable output

Target options:
  Convex:  --prod --deployment-name <name> --preview-name <name> --env-file <path> --component <name>
  Concave: --url <url> --port <port> --component <name>`;

export const parseAuthCommandArgs = (args: string[]) => {
  const subcommand = args[0];
  if (!subcommand) {
    throw new Error('Missing auth command. Usage: `kitcn auth jwks`.');
  }
  if (subcommand !== 'jwks') {
    throw new Error(
      `Unknown auth command "${subcommand}". Supported commands: jwks.`
    );
  }

  let json = false;
  let rotate = false;
  const targetRemainder: string[] = [];

  for (const arg of args.slice(1)) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--rotate') {
      rotate = true;
      continue;
    }
    targetRemainder.push(arg);
  }

  return {
    json,
    rotate,
    subcommand,
    targetRemainder,
  };
};

const formatRelativePath = (cwd: string, filePath: string) =>
  path.relative(cwd, filePath).replaceAll('\\', '/') || '.';

const assertAuthRuntimeReady = (sharedDir?: string) => {
  const cwd = process.cwd();
  const authState = resolveAuthEnvState({
    cwd,
    sharedDir,
  });

  if (!authState.installed) {
    throw new Error(
      `Auth JWKS export requires auth scaffold at ${formatRelativePath(cwd, authState.definitionPath)}. Install auth first.`
    );
  }
  if (!authState.runtimeReady) {
    throw new Error(
      `Auth JWKS export requires generated auth runtime at ${formatRelativePath(cwd, authState.generatedPath)}. Run \`kitcn codegen\` or \`kitcn dev --bootstrap\` first.`
    );
  }
};

const parseRunValue = (stdout: string) => {
  const parsed = parseBackendRunJson<unknown>(stdout);
  return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
};

export const handleAuthCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  if (
    argv.length === 0 ||
    HELP_FLAGS.has(argv[0] ?? '') ||
    parsed.restArgs.length === 0 ||
    parsed.restArgs.some((arg) => HELP_FLAGS.has(arg))
  ) {
    logger.write(AUTH_HELP_TEXT);
    return 0;
  }

  const authArgs = parseAuthCommandArgs(parsed.restArgs);
  const {
    execa: execaFn,
    loadCliConfig: loadCliConfigFn,
    realConcave: realConcavePath,
    realConvex: realConvexPath,
  } = resolveRunDeps(deps);
  const config = loadCliConfigFn(parsed.configPath);
  const backend = resolveConfiguredBackend({
    backendArg: parsed.backend,
    config,
  });
  const backendAdapter = createBackendAdapter({
    backend,
    realConvexPath,
    realConcavePath,
  });
  const sharedDir = parsed.sharedDir ?? config.paths.shared;
  assertAuthRuntimeReady(sharedDir);
  const targetArgs = extractBackendRunTargetArgs(
    backend,
    authArgs.targetRemainder
  );

  if (authArgs.rotate) {
    const rotateResult = await runBackendFunction(
      execaFn,
      backendAdapter,
      AUTH_ROTATE_KEYS_FUNCTION,
      {},
      targetArgs,
      {
        echoOutput: false,
      }
    );
    if (rotateResult.exitCode !== 0) {
      return rotateResult.exitCode;
    }
  }

  const jwksResult = await runBackendFunction(
    execaFn,
    backendAdapter,
    AUTH_JWKS_FUNCTION,
    {},
    targetArgs,
    {
      echoOutput: false,
    }
  );
  if (jwksResult.exitCode !== 0) {
    return jwksResult.exitCode;
  }

  const jwks = parseRunValue(jwksResult.stdout);
  const envLine = `JWKS=${serializeEnvValue(jwks)}`;

  if (authArgs.json) {
    console.info(
      JSON.stringify({
        backend,
        command: 'auth',
        envLine,
        jwks,
        rotated: authArgs.rotate,
        subcommand: authArgs.subcommand,
      })
    );
  } else {
    console.info(envLine);
  }

  return 0;
};
