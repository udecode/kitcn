import fs from 'node:fs';
import {
  createBackendAdapter,
  createBackendCommandEnv,
  parseArgs,
  type RunDeps,
  resolveConfiguredBackend,
  resolveRunDeps,
} from '../backend-core.js';
import { logger } from '../utils/logger.js';

const HELP_FLAGS = new Set(['--help', '-h']);
const SUPPORTED_ENV_SUBCOMMANDS = [
  'push',
  'pull',
  'list',
  'get',
  'set',
  'remove',
] as const;
const TARGET_FLAGS = new Set([
  '--prod',
  '--deployment-name',
  '--preview-name',
  '--env-file',
]);
const TARGET_FLAGS_WITH_VALUE = new Set([
  '--deployment-name',
  '--preview-name',
  '--env-file',
]);

export const ENV_HELP_TEXT = `Usage: better-convex env <command> [options]

Commands:
  push                       Push local env values to Convex
  pull                       Pull remote env values from Convex
  list                       List remote env values
  get <name>                 Read one remote env value
  set [name] [value]         Set env value(s)
  remove <name>              Remove a remote env value

Push options:
  --from-file <path>         Push values from a file instead of convex/.env
  --force                    Overwrite conflicting remote values
  --auth                     Include BETTER_AUTH_SECRET and JWKS
  --rotate                   Rotate auth keys before fetching JWKS

Pull options:
  --out <path>               Write pulled values to a file

Target options:
  --prod
  --deployment-name <name>
  --preview-name <name>
  --env-file <path>`;

const isHelpRequest = (args: string[]) =>
  args.some((arg) => HELP_FLAGS.has(arg));

const assertConvexEnvBackend = (
  args: string[],
  deps: Pick<RunDeps, 'loadBetterConvexConfig' | 'realConcave' | 'realConvex'>
) => {
  const parsed = parseArgs(args);
  const config = deps.loadBetterConvexConfig(parsed.configPath);
  const backend = resolveConfiguredBackend({
    backendArg: parsed.backend,
    config,
  });
  if (backend === 'concave') {
    throw new Error(
      '`better-convex env` is only supported on the Convex backend.'
    );
  }
};

const readPipedStdin = () => {
  try {
    const stat = fs.fstatSync(0);
    if (!stat.isFIFO() && !stat.isFile()) {
      return undefined;
    }
    const content = fs.readFileSync(0, 'utf8');
    return content.length > 0 ? content : undefined;
  } catch {
    return undefined;
  }
};

const readFlagValue = (
  args: string[],
  index: number,
  flag: string
): { nextIndex: number; value: string } => {
  const arg = args[index];
  if (arg?.startsWith(`${flag}=`)) {
    const value = arg.slice(flag.length + 1);
    if (value.length === 0) {
      throw new Error(`Missing value for ${flag}.`);
    }
    return {
      nextIndex: index,
      value,
    };
  }

  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return {
    nextIndex: index + 1,
    value,
  };
};

const parseTargetArgs = (args: string[]) => {
  const targetArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || !TARGET_FLAGS.has(arg)) {
      throw new Error(`Unknown env option "${arg ?? ''}".`);
    }

    targetArgs.push(arg);
    if (TARGET_FLAGS_WITH_VALUE.has(arg)) {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}.`);
      }
      targetArgs.push(value);
      index += 1;
    }
  }

  return targetArgs;
};

const parsePushArgs = (args: string[]) => {
  let auth = false;
  let force = false;
  let fromFilePath: string | undefined;
  let rotate = false;
  const targetRemainder: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === '--auth') {
      auth = true;
      continue;
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--rotate') {
      rotate = true;
      continue;
    }
    if (arg === '--from-file' || arg.startsWith('--from-file=')) {
      const parsedValue = readFlagValue(args, index, '--from-file');
      fromFilePath = parsedValue.value;
      index = parsedValue.nextIndex;
      continue;
    }
    targetRemainder.push(arg);
  }

  return {
    auth,
    force,
    fromFilePath,
    rotate,
    targetArgs: parseTargetArgs(targetRemainder),
  };
};

const parsePullArgs = (args: string[]) => {
  let outFilePath: string | undefined;
  const targetRemainder: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === '--out' || arg.startsWith('--out=')) {
      const parsedValue = readFlagValue(args, index, '--out');
      outFilePath = parsedValue.value;
      index = parsedValue.nextIndex;
      continue;
    }
    targetRemainder.push(arg);
  }

  return {
    outFilePath,
    targetArgs: parseTargetArgs(targetRemainder),
  };
};

export const handleEnvCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  if (
    parsed.convexArgs.length === 0 ||
    HELP_FLAGS.has(argv[0] ?? '') ||
    isHelpRequest(parsed.restArgs)
  ) {
    logger.write(ENV_HELP_TEXT);
    return 0;
  }

  const {
    execa: execaFn,
    loadBetterConvexConfig: loadBetterConvexConfigFn,
    pullEnv: pullEnvFn,
    realConvex: realConvexPath,
    realConcave: realConcavePath,
    syncEnv: pushEnvFn,
  } = resolveRunDeps(deps);
  const subcommand = parsed.convexArgs[0];

  if (!subcommand || !SUPPORTED_ENV_SUBCOMMANDS.includes(subcommand as never)) {
    throw new Error(
      `Unsupported env command "${subcommand ?? ''}". Supported commands: ${SUPPORTED_ENV_SUBCOMMANDS.join(', ')}.`
    );
  }

  assertConvexEnvBackend(argv, {
    loadBetterConvexConfig: loadBetterConvexConfigFn,
    realConcave: realConcavePath,
    realConvex: realConvexPath,
  });

  if (subcommand === 'push') {
    const pushArgs = parsePushArgs(parsed.convexArgs.slice(1));
    await pushEnvFn({
      ...pushArgs,
      sourceContent:
        pushArgs.fromFilePath === undefined ? readPipedStdin() : undefined,
    });
    return 0;
  }

  if (subcommand === 'pull') {
    await pullEnvFn(parsePullArgs(parsed.convexArgs.slice(1)));
    return 0;
  }

  const backendAdapter = createBackendAdapter({
    backend: 'convex',
    realConvexPath,
    realConcavePath,
  });
  const result = await execaFn(
    backendAdapter.command,
    [...backendAdapter.argsPrefix, 'env', ...parsed.convexArgs],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: createBackendCommandEnv(),
      reject: false,
    }
  );
  return result.exitCode ?? 0;
};
