import {
  parseArgs,
  type RunDeps,
  resolveConfiguredBackend,
  resolveRunDeps,
  runConfiguredCodegen,
} from '../backend-core.js';
import { logger } from '../utils/logger.js';

const HELP_FLAGS = new Set(['--help', '-h']);

export const CODEGEN_HELP_TEXT = `Usage: better-convex codegen [options]

Options:
  --api <dir>       Output directory (default from config)
  --scope <mode>    Generation scope: all | auth | orm
  --config <path>   Config path override
  --debug           Show detailed output`;

export const handleCodegenCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  if (
    HELP_FLAGS.has(argv[0] ?? '') ||
    HELP_FLAGS.has(parsed.restArgs[0] ?? '')
  ) {
    logger.write(CODEGEN_HELP_TEXT);
    return 0;
  }

  const {
    execa: execaFn,
    generateMeta: generateMetaFn,
    loadBetterConvexConfig: loadBetterConvexConfigFn,
    realConvex: realConvexPath,
    realConcave: realConcavePath,
  } = resolveRunDeps(deps);
  const config = loadBetterConvexConfigFn(parsed.configPath);
  const sharedDir = parsed.sharedDir ?? config.paths.shared;
  const scope = parsed.scope ?? config.codegen.scope;
  const debug = parsed.debug || config.codegen.debug;
  const backend = resolveConfiguredBackend({
    backendArg: parsed.backend,
    config,
  });

  if (scope) {
    return runConfiguredCodegen({
      config: {
        ...config,
        codegen: {
          ...config.codegen,
          scope,
        },
      },
      sharedDir,
      debug,
      generateMetaFn,
      execaFn,
      realConvexPath,
      realConcavePath,
      additionalConvexArgs: parsed.convexArgs,
      backend,
    });
  }

  return runConfiguredCodegen({
    config,
    sharedDir,
    debug,
    generateMetaFn,
    execaFn,
    realConvexPath,
    realConcavePath,
    additionalConvexArgs: parsed.convexArgs,
    backend,
  });
};
