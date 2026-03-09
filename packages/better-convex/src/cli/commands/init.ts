import { relative } from 'node:path';
import {
  parseArgs,
  parseInitCommandArgs,
  type RunDeps,
  resolveRunDeps,
  runInitCommandFlow,
} from '../core.js';
import { logger } from '../utils/logger.js';

const HELP_FLAGS = new Set(['--help', '-h']);

export const INIT_HELP_TEXT = `Usage: better-convex init [options]

Options:
  --template, -t    App template (only "next" is supported)
  --cwd             Target directory
  --name            Project name when creating a fresh app
  --team            Convex team slug for non-interactive bootstrap
  --project         Convex project slug for non-interactive bootstrap
  --dev-deployment  Convex dev deployment kind (cloud|local, default: local)
  --yes, -y         Deterministic non-interactive mode
  --defaults        Use default shadcn init answers
  --json            Machine-readable command output`;

export {
  INIT_SHADCN_PACKAGE_SPEC,
  parseInitCommandArgs,
  resolveInitProjectDir,
  resolveInitTargetCwd,
  resolveSupportedInitTemplate,
} from '../core.js';

export const handleInitCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  if (
    HELP_FLAGS.has(argv[0] ?? '') ||
    HELP_FLAGS.has(parsed.restArgs[0] ?? '')
  ) {
    logger.write(INIT_HELP_TEXT);
    return 0;
  }

  const initArgs = parseInitCommandArgs(parsed.restArgs);
  const {
    execa: execaFn,
    generateMeta: generateMetaFn,
    ensureConvexGitignoreEntry: ensureConvexGitignoreEntryFn,
    loadBetterConvexConfig: loadBetterConvexConfigFn,
    promptAdapter,
    realConvex: realConvexPath,
    realConcave: realConcavePath,
  } = resolveRunDeps(deps);
  const result = await runInitCommandFlow({
    initArgs,
    backendArg: parsed.backend,
    configPath: parsed.configPath,
    execaFn,
    generateMetaFn,
    loadBetterConvexConfigFn,
    ensureConvexGitignoreEntryFn,
    promptAdapter,
    realConvexPath,
    realConcavePath,
  });

  const cwdRelative =
    relative(process.cwd(), result.cwd).replaceAll('\\', '/') || '.';

  if (initArgs.json) {
    console.info(
      JSON.stringify({
        command: 'init',
        backend: result.backend,
        cwd: cwdRelative,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        usedShadcn: result.usedShadcn,
        template: result.template,
        codegen: result.codegen,
        convexBootstrap: result.convexBootstrap,
      })
    );
  } else {
    logger.success(
      `✔ bootstrapped Better Convex: ${result.created.length} created, ${result.updated.length} updated, ${result.skipped.length} skipped.`
    );
  }

  return 0;
};
