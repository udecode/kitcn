import fs from 'node:fs';
import { relative } from 'node:path';
import {
  parseArgs,
  parseInitCommandArgs,
  type RunDeps,
  resolveConfiguredBackend,
  resolveInitProjectDir,
  resolveRunDeps,
  runInitCommandFlow,
  withWorkingDirectory,
} from '../backend-core.js';
import type { CliBackend } from '../config.js';
import { runLocalConvexBootstrap } from './dev.js';

export {
  detectProjectFramework,
  mapFrameworkToScaffoldMode,
} from '../project-context.js';

import { logger } from '../utils/logger.js';

const HELP_FLAGS = new Set(['--help', '-h']);
const INIT_LOCAL_BOOTSTRAP_PROMPT =
  'Run one-shot local Convex bootstrap after init completes?';

type InitDeps = Partial<RunDeps> & {
  runLocalBootstrap?: typeof runLocalConvexBootstrap;
};

export const INIT_HELP_TEXT = `Usage: kitcn init [options]

Options:
  --template, -t    App template ("next" or "vite") for fresh app scaffolding
  --cwd             Target directory (or parent when used with --name)
  --name            Project name when scaffolding a fresh app
  --prod            Forward to \`convex init\`
  --preview-name    Forward to \`convex init\`
  --deployment-name Forward to \`convex init\`
  --env-file        Forward to \`convex init\`
  --yes, -y         Deterministic non-interactive mode
  --defaults        Use default shadcn init answers
  --overwrite       Overwrite existing changed files without prompt
  --json            Machine-readable command output`;

export {
  INIT_SHADCN_PACKAGE_SPEC,
  parseInitCommandArgs,
  resolveInitProjectDir,
  resolveInitTargetCwd,
  resolveScaffoldInstallSpec,
  resolveSupportedInitTemplate,
} from '../backend-core.js';
export { KITCN_INSTALL_SPEC_ENV } from '../supported-dependencies.js';

export const handleInitCommand = async (
  argv: string[],
  deps: InitDeps = {}
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
  const bootstrapConfigPath = parsed.configPath;
  const {
    execa: execaFn,
    generateMeta: generateMetaFn,
    ensureConvexGitignoreEntry: ensureConvexGitignoreEntryFn,
    loadCliConfig: loadCliConfigFn,
    promptAdapter,
    syncEnv: syncEnvFn,
    realConvex: realConvexPath,
    realConcave: realConcavePath,
  } = resolveRunDeps(deps);
  const runLocalBootstrapFn = deps.runLocalBootstrap ?? runLocalConvexBootstrap;
  const shouldRunLocalBootstrap = await resolveInitLocalBootstrap({
    initArgs,
    backendArg: parsed.backend,
    configPath: bootstrapConfigPath,
    loadCliConfigFn,
    promptAdapter,
  });

  const result = await runInitCommandFlow({
    initArgs,
    backendArg: parsed.backend,
    configPath: parsed.configPath,
    execaFn,
    generateMetaFn,
    syncEnvFn,
    loadCliConfigFn,
    ensureConvexGitignoreEntryFn,
    promptAdapter,
    realConvexPath,
    realConcavePath,
  });

  if (
    shouldRunLocalBootstrap &&
    !result.usedShadcn &&
    !result.localBootstrapUsed
  ) {
    await withWorkingDirectory(result.cwd, async () => {
      const config = loadCliConfigFn(bootstrapConfigPath);
      const exitCode = await runLocalBootstrapFn({
        config,
        debug: config.dev.debug,
        execaFn,
        generateMetaFn,
        realConvexPath,
        realConcavePath,
        sharedDir: config.paths.shared,
        syncEnvFn,
        targetArgs: [],
      });
      if (exitCode !== 0) {
        throw new Error(
          'Failed to run local Convex bootstrap during `kitcn init`.'
        );
      }
    });
  }

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
        localBootstrap: shouldRunLocalBootstrap ? 'completed' : 'skipped',
      })
    );
  } else {
    logger.success(
      `✔ bootstrapped kitcn: ${result.created.length} created, ${result.updated.length} updated, ${result.skipped.length} skipped.`
    );
  }

  return 0;
};

async function resolveInitLocalBootstrap(params: {
  initArgs: ReturnType<typeof parseInitCommandArgs>;
  backendArg?: CliBackend;
  configPath?: string;
  loadCliConfigFn: RunDeps['loadCliConfig'];
  promptAdapter: RunDeps['promptAdapter'];
}): Promise<boolean> {
  if ((params.initArgs.targetArgs?.length ?? 0) > 0) {
    return false;
  }

  const bootstrapBackend = await resolveInitBootstrapBackend({
    initArgs: params.initArgs,
    backendArg: params.backendArg,
    configPath: params.configPath,
    loadCliConfigFn: params.loadCliConfigFn,
  });
  if (bootstrapBackend !== 'convex') {
    return false;
  }

  if (params.initArgs.json) {
    return false;
  }

  if (params.initArgs.yes) {
    return true;
  }

  if (!params.promptAdapter.isInteractive()) {
    return false;
  }

  return params.promptAdapter.confirm(INIT_LOCAL_BOOTSTRAP_PROMPT, true);
}

async function resolveInitBootstrapBackend(params: {
  initArgs: ReturnType<typeof parseInitCommandArgs>;
  backendArg?: CliBackend;
  configPath?: string;
  loadCliConfigFn: RunDeps['loadCliConfig'];
}): Promise<CliBackend> {
  if (params.backendArg) {
    return params.backendArg;
  }

  if (params.initArgs.template) {
    return 'convex';
  }

  const projectDir = resolveInitProjectDir(params.initArgs);
  if (!fs.existsSync(projectDir)) {
    return 'convex';
  }

  return withWorkingDirectory(projectDir, async () => {
    const config = params.loadCliConfigFn(params.configPath);
    return resolveConfiguredBackend({ config });
  });
}
