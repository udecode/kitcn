import { relative } from 'node:path';
import {
  parseArgs,
  parseCreateCommandArgs,
  type RunDeps,
  resolveRunDeps,
  runCreateCommandFlow,
} from '../backend-core.js';
import { logger } from '../utils/logger.js';

const HELP_FLAGS = new Set(['--help', '-h']);

export const CREATE_HELP_TEXT = `Usage: better-convex create [options]

Options:
  --template, -t    App template ("next" or "vite")
  --cwd             Parent directory for the new app
  --name            Project name when creating a fresh app
  --prod            Forward to \`convex init\`
  --preview-name    Forward to \`convex init\`
  --deployment-name Forward to \`convex init\`
  --env-file        Forward to \`convex init\`
  --yes, -y         Deterministic non-interactive mode
  --defaults        Use default shadcn init answers
  --json            Machine-readable command output`;

export {
  INIT_SHADCN_PACKAGE_SPEC,
  parseCreateCommandArgs,
  resolveBetterConvexScaffoldInstallSpec,
  resolveCreateProjectDir,
  resolveSupportedCreateTemplate,
} from '../backend-core.js';
export { BETTER_CONVEX_INSTALL_SPEC_ENV } from '../supported-dependencies.js';

export const handleCreateCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  if (
    HELP_FLAGS.has(argv[0] ?? '') ||
    HELP_FLAGS.has(parsed.restArgs[0] ?? '')
  ) {
    logger.write(CREATE_HELP_TEXT);
    return 0;
  }

  const createArgs = parseCreateCommandArgs(parsed.restArgs);
  const {
    execa: execaFn,
    generateMeta: generateMetaFn,
    ensureConvexGitignoreEntry: ensureConvexGitignoreEntryFn,
    loadBetterConvexConfig: loadBetterConvexConfigFn,
    promptAdapter,
    realConvex: realConvexPath,
    realConcave: realConcavePath,
  } = resolveRunDeps(deps);
  const result = await runCreateCommandFlow({
    createArgs,
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

  if (createArgs.json) {
    console.info(
      JSON.stringify({
        command: 'create',
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
