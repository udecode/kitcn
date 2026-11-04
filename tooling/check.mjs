import { spawn } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import {
  availableParallelism,
  constants as osConstants,
  tmpdir,
} from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { freshRun, openCache } from './check-cache.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const under =
  (...prefixes) =>
  (file) =>
    prefixes.some((prefix) =>
      prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix
    );
const any =
  (...tests) =>
  (files) =>
    files.some((file) => tests.some((test) => test(file)));
const CODE = /\.(?:[cm]?[jt]sx?)$/u;
const code = (file) => CODE.test(file);
const LINTED = /\.(?:[cm]?[jt]sx?|jsonc?|css|graphql)$/u;
const TYPED = /\.(?:[cm]?[jt]sx?|json)$/u;
const PACKAGE_SOURCE =
  /^packages\/[^/]+\/(?:src\/|package\.json$|tsdown\.config\.\w+$|tsconfig[\w.-]*\.json$)/u;
const TEST_FILE = /\.(?:test|vitest|test-d)\.[cm]?[jt]sx?$/u;
const packageSource = (file) =>
  PACKAGE_SOURCE.test(file) && !TEST_FILE.test(file);
const scaffoldTooling = under(
  'tooling/auth-schema-stress.ts',
  'tooling/check-convex-scenarios.ts',
  'tooling/dependency-pins.ts',
  'tooling/fixtures.ts',
  'tooling/scaffold-utils.ts',
  'tooling/scenario-fixtures/',
  'tooling/scenario.config.ts',
  'tooling/scenarios.ts',
  'tooling/template.config.ts'
);

const GLOBAL_PATHS = under(
  'biome.jsonc',
  'bun.lock',
  'bunfig.toml',
  'eslint.config.mjs',
  'package.json',
  'tooling/global.d.ts',
  'tooling/test-setup.ts',
  'tooling/test-setup-solid.ts',
  'tsconfig.json',
  'turbo.json',
  'vitest.config.mts'
);

/**
 * @typedef {{
 *   name: string,
 *   run: string,
 *   affected: (files: string[]) => boolean,
 *   after?: string[],
 *   cache?: boolean,
 *   ci?: boolean,
 *   cores?: number,
 *   fix?: string,
 *   filesOnly?: boolean,
 *   holds?: string[],
 * }} Step
 */

/** @type {Step[]} */
export const steps = [
  {
    name: 'build',
    run: 'bun build:pkg',
    cache: false,
    affected: any(packageSource),
  },
  {
    name: 'intent',
    run: 'bun run intent:validate',
    affected: any(
      under('packages/kitcn/skills/', 'packages/kitcn/package.json')
    ),
    filesOnly: true,
  },
  {
    name: 'lint',
    run: 'bun lint',
    fix: 'bun lint:fix',
    affected: any((file) => LINTED.test(file)),
    filesOnly: true,
  },
  {
    name: 'typecheck',
    after: ['build'],
    cores: 2,
    run: 'bun typecheck',
    affected: any((file) => TYPED.test(file)),
    filesOnly: true,
  },
  {
    name: 'test-bun',
    cores: 2,
    after: ['build'],
    run: 'bun run test:bun',
    affected: any((file) => file.startsWith('packages/') && code(file)),
    filesOnly: true,
  },
  {
    name: 'test-vitest',
    cores: 2,
    after: ['build'],
    run: 'bun run test:vitest',
    affected: any(
      (file) =>
        (file.startsWith('packages/') || file.startsWith('convex/')) &&
        code(file)
    ),
    filesOnly: true,
  },
  {
    name: 'test-tooling',
    after: ['build'],
    run: 'KITCN_SKIP_LOCAL_BUILD=1 bun test --timeout 30000 ./tooling',
    affected: any(
      (file) =>
        (file.startsWith('tooling/') ||
          file.startsWith('packages/kitcn/src/cli/')) &&
        code(file)
    ),
    filesOnly: true,
  },
  {
    name: 'test-cli',
    after: ['build'],
    run: 'KITCN_SKIP_LOCAL_BUILD=1 CI=1 bun test ./packages/kitcn/src/cli/cli.commands.ts',
    affected: any(packageSource, scaffoldTooling),
    filesOnly: true,
  },
  {
    name: 'test-concave',
    run: 'bun run test:concave',
    affected: any(packageSource, under('test/concave/')),
    filesOnly: true,
  },
  {
    name: 'fixtures',
    after: ['build'],
    run: 'KITCN_SKIP_LOCAL_BUILD=1 bun run fixtures:check',
    affected: any(packageSource, scaffoldTooling, under('fixtures/')),
    filesOnly: true,
  },
  // CI skips the scenario steps; the Convex Matrix workflow runs the runtime
  // scenarios on the release branch.
  {
    name: 'scenario-verify',
    ci: false,
    after: ['build'],
    holds: ['tmp/scenarios'],
    run: 'KITCN_SKIP_LOCAL_BUILD=1 bun run test:verify',
    affected: any(packageSource, scaffoldTooling),
    filesOnly: true,
  },
  {
    name: 'scenario-runtime',
    ci: false,
    after: ['build'],
    holds: ['tmp/scenarios'],
    run: 'KITCN_SKIP_LOCAL_BUILD=1 bun run test:runtime',
    affected: any(packageSource, scaffoldTooling),
    filesOnly: true,
  },
];

export const manualOnly = {
  analyze: 'Bundle analysis of the example app; it gates nothing.',
  build: 'Builds the www site, which no check reads.',
  'build:watch': 'Watch mode.',
  check: 'This runner.',
  'ci:release': 'Publishes packages from the release workflow.',
  'ci:version': 'Versions packages from the release workflow.',
  'deps:sync': 'Writes the pinned dependency versions.',
  'deps:upgrade': 'Upgrades the pinned dependency versions.',
  dev: 'Serves the www site.',
  'fixtures:check:auto': 'Syncs the fixtures, then checks them, so it writes.',
  'fixtures:check:full':
    'Checks every fixture scope; run it by hand before a release.',
  'fixtures:sync': 'Writes the fixtures.',
  gen: 'Generates the example app.',
  'intent:build': 'Builds the package for the intent check.',
  'intent:check':
    'Runs intent:validate, which the intent step runs, then writes with lint:fix.',
  'intent:pack': 'Dry-runs npm pack for the intent check.',
  'intent:scaffold': 'Scaffolds intent skills.',
  'intent:stale': 'Lists stale intent skills; it gates nothing.',
  'lint:fix': 'Writes lint fixes.',
  'lint:slop': 'Reports slop findings; it gates nothing.',
  'lint:slop:delta': 'Reports new slop findings; it gates nothing.',
  postinstall: 'Runs on install.',
  release: 'Publishes packages.',
  'scenario:check': 'Checks one named scenario.',
  'scenario:check:convex':
    'Checks the Convex scenarios against a live Convex backend.',
  'scenario:codegen': 'Runs codegen in one named scenario.',
  'scenario:dev': 'Serves one named scenario.',
  'scenario:prepare':
    'Prepares one named scenario, which the scenario steps call.',
  'scenario:test':
    'Tests one named scenario, which the scenario-runtime step calls.',
  'schema:stress': 'Stresses the auth schema; run it by hand.',
  start: 'Serves the built www site.',
  test: 'Runs test:bun and test:vitest, which the test-bun and test-vitest steps run.',
  'test:auth': 'Auth smoke against a live backend.',
  'test:cli': 'Runs the CLI command tests, which the test-cli step runs.',
  'test:coverage': 'Reports coverage; it gates nothing.',
  'test:e2e': 'Auth browser end to end, kept out of every gate.',
  'test:limits:stress': 'Stress lane; run it by hand.',
  'test:limits:stress:coverage': 'Stress lane coverage; run it by hand.',
  'test:limits:tune': 'Tunes limit defaults; it gates nothing.',
  'test:runtime':
    'Runs the runtime scenario, which the scenario-runtime step runs.',
  'test:verify':
    'Runs kitcn verify in a fresh scenario, which the scenario-verify step runs.',
  'typecheck:convex':
    'Typechecks the Convex package, which the typecheck step covers.',
  'typecheck:watch': 'Watch mode.',
};

export const scriptCoverage = () => {
  const scripts = Object.keys(
    JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).scripts
  );
  const ran = (name) =>
    steps.some((step) =>
      new RegExp(
        `\\bbun (?:run )?${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![\\w:.-])`,
        'u'
      ).test(step.run)
    );
  return {
    stale: Object.keys(manualOnly).filter((name) => !scripts.includes(name)),
    unlisted: scripts.filter((name) => !ran(name) && !(name in manualOnly)),
  };
};

export const planAffected = (files) => {
  const everything = files.some(GLOBAL_PATHS);
  return steps.map((step) => ({
    needed: files.length > 0 && (everything || step.affected(files)),
    step,
  }));
};

const scopeOf = (step) => ({
  cache: step.cache,
  command: step.run,
  filesOnly: step.filesOnly,
  name: step.name,
});

const coverOf = (step, bases) => {
  for (const base of bases.toSorted(
    (a, b) => a.files.length - b.files.length
  )) {
    if (base.kind === 'exact') return base;
    if (!planAffected(base.files).find((entry) => entry.step === step).needed) {
      return base;
    }
  }
  return null;
};

const runStep = (command, { log, running }) => {
  const started = Date.now();
  const output = openSync(log, 'w');
  const child = spawn('bash', ['-o', 'pipefail', '-c', command], {
    cwd: root,
    stdio: ['ignore', output, output],
  });
  closeSync(output);
  running.add(child);
  return new Promise((resolveStep) => {
    const finish = (status) => {
      if (!running.delete(child)) return;
      resolveStep({
        seconds: Math.round((Date.now() - started) / 1000),
        status,
      });
    };
    child.once('error', (error) => {
      appendFileSync(log, `${error.message}\n`);
      finish(1);
    });
    child.once('exit', (code) => finish(code ?? 1));
  });
};

const schedule = async (entries, budget, start, stopped) => {
  const slots = ({ step }) => Math.min(step.cores ?? 1, budget);
  const pending = entries.toSorted(
    (a, b) => (b.step.cores ?? 1) - (a.step.cores ?? 1)
  );
  const unfinished = new Set(pending.map(({ step }) => step.name));
  const failed = new Set();
  const held = new Set();
  const active = new Set();
  let free = budget;
  const launch = () => {
    for (const entry of [...pending]) {
      const holds = entry.step.holds ?? [];
      const after = entry.step.after ?? [];
      if (after.some((name) => failed.has(name))) {
        pending.splice(pending.indexOf(entry), 1);
        unfinished.delete(entry.step.name);
        failed.add(entry.step.name);
        start(entry, `${after.find((name) => failed.has(name))} failed`);
        continue;
      }
      if (
        slots(entry) > free ||
        holds.some((name) => held.has(name)) ||
        after.some((name) => unfinished.has(name))
      ) {
        continue;
      }
      pending.splice(pending.indexOf(entry), 1);
      free -= slots(entry);
      for (const name of holds) held.add(name);
      const run = start(entry).then((status) => {
        free += slots(entry);
        for (const name of holds) held.delete(name);
        unfinished.delete(entry.step.name);
        if (status !== 0) failed.add(entry.step.name);
        active.delete(run);
      });
      active.add(run);
    }
  };
  launch();
  while (active.size > 0) {
    await Promise.race(active);
    if (!stopped()) launch();
  }
};

const USAGE =
  'Usage: bun check [--affected] [--ci] [--list] [step...]. --affected runs only the steps the change since origin/main reaches, --ci skips the steps CI leaves out, and CHECK_FRESH=1 ignores recorded passes.';

const main = async () => {
  const args = process.argv.slice(2);
  const flags = ['--affected', '--ci', '--list'];
  const unknownFlags = args.filter(
    (arg) => arg.startsWith('--') && !flags.includes(arg)
  );
  if (unknownFlags.length > 0) {
    console.error(`[check] unknown flag: ${unknownFlags.join(', ')}. ${USAGE}`);
    return 1;
  }
  const names = args.filter((arg) => !arg.startsWith('--'));
  const { stale, unlisted } = scriptCoverage();
  if (unlisted.length > 0 || stale.length > 0) {
    console.error(
      [
        unlisted.length > 0 &&
          `[check] no step runs ${unlisted.join(', ')}; add a step that runs it, or list it in manualOnly in tooling/check.mjs with why no step needs it.`,
        stale.length > 0 &&
          `[check] manualOnly in tooling/check.mjs lists ${stale.join(', ')}, which package.json no longer has; remove it.`,
      ]
        .filter(Boolean)
        .join('\n')
    );
    return 1;
  }
  if (args.includes('--list')) {
    for (const step of steps) console.info(`${step.name}\t${step.run}`);
    return 0;
  }
  const unknown = names.filter(
    (name) => !steps.some((step) => step.name === name)
  );
  if (unknown.length > 0) {
    console.error(
      `[check] unknown step: ${unknown.join(', ')}. Run bun check --list.`
    );
    return 1;
  }
  const affected = args.includes('--affected');
  if (affected && names.length > 0) {
    console.error(
      '[check] --affected picks its own steps; run it without step names.'
    );
    return 1;
  }

  const ci = args.includes('--ci');
  const chosen = steps.filter(
    (step) =>
      (names.length === 0 || names.includes(step.name)) &&
      !(ci && step.ci === false)
  );
  const cache = openCache(root, { fresh: freshRun(process.env) });
  const selected = [];
  for (const step of chosen) {
    const scope = scopeOf(step);
    const cover = coverOf(
      step,
      cache.bases(scope, { mergeBase: affected, near: affected })
    );
    if (cover) {
      console.info(
        `  skip ${step.name}: ${cover.label}${cover.files.length > 0 ? `, and none of the ${cover.files.length} files changed since reaches it` : ''}`
      );
      continue;
    }
    selected.push({ scope, step });
  }
  for (const entry of [...selected]) {
    for (const name of entry.step.after ?? []) {
      if (selected.some(({ step }) => step.name === name)) continue;
      const step = steps.find((each) => each.name === name);
      selected.push({ scope: scopeOf(step), step });
    }
  }

  const group = Boolean(process.env.GITHUB_ACTIONS);
  const results = new Map();
  const share = Math.ceil(availableParallelism() / 2);
  const budget = Math.min(
    share,
    selected.reduce(
      (sum, { step }) => sum + Math.min(step.cores ?? 1, share),
      0
    )
  );
  const logs = mkdtempSync(join(tmpdir(), 'kitcn-check-'));
  const running = new Set();
  let interrupted = 0;
  // Steps share this process group, so a terminal's signal to the group
  // reaches each of them; this passes on one sent to this process.
  const stop = (signal) => {
    interrupted ||= 128 + osConstants.signals[signal];
    for (const child of running) child.kill(signal);
  };
  const signals = ['SIGHUP', 'SIGINT', 'SIGTERM'];
  for (const signal of signals) process.on(signal, stop);
  if (selected.some(({ scope }) => scope.cache !== false)) cache.stampFiles();
  const start = async ({ scope, step }, blocked) => {
    if (blocked) {
      results.set(step.name, { blocked, seconds: 0, status: 1 });
      console.info(`[check] ${step.name} not run: ${blocked}`);
      return 1;
    }
    console.info(`[check] ${step.name} started`);
    const log = join(logs, `${step.name}.log`);
    cache.begin(step.name);
    const result = await runStep(step.run, {
      log,
      running,
    });
    results.set(step.name, result);
    // bun can exit 0 when an interrupt stops its script, so a step that ends
    // after one never counts as passed.
    cache.end(scope, {
      passed: result.status === 0 && !interrupted,
      seconds: result.seconds,
    });
    if (group) console.info(`::group::${step.name}`);
    console.info(`${group ? '' : '\n'}[check] ${step.name}: ${step.run}`);
    process.stdout.write(readFileSync(log));
    rmSync(log, { force: true });
    const state = interrupted
      ? 'interrupted'
      : result.status === 0
        ? 'ok'
        : `failed (exit ${result.status})`;
    console.info(`[check] ${step.name} ${state} in ${result.seconds}s`);
    if (group) console.info('::endgroup::');
    return result.status;
  };
  try {
    await schedule(selected, budget, start, () => interrupted !== 0);
  } finally {
    for (const signal of signals) process.removeListener(signal, stop);
    rmSync(logs, { force: true, recursive: true });
  }
  if (interrupted) return interrupted;
  const { dropped } = cache.flush();
  if (dropped) console.info(`[check] ${dropped}.`);

  console.info('\n[check] summary');
  let failed = 0;
  for (const { step } of selected) {
    const { blocked, seconds, status } = results.get(step.name);
    if (status !== 0) failed += 1;
    const state =
      status === 0
        ? 'ok'
        : blocked
          ? `not run: ${blocked}`
          : `failed (exit ${status})${step.fix ? `; fix: ${step.fix}` : ''}`;
    console.info(
      `  ${step.name.padEnd(18)} ${String(seconds).padStart(4)}s  ${state}`
    );
  }
  if (failed > 0) {
    console.error(`[check] ${failed} of ${selected.length} steps failed.`);
    return 1;
  }
  const covered =
    chosen.length - selected.filter(({ step }) => chosen.includes(step)).length;
  console.info(
    `[check] all ${selected.length} steps passed${covered > 0 ? `; ${covered} skipped on an earlier pass` : ''}.`
  );
  return 0;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // exitCode instead of exit, so the step logs written to a pipe drain first.
  void main().then((code) => {
    process.exitCode = code;
  });
}
