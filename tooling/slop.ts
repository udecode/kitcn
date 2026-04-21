import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type DeltaChange = {
  status: 'added' | 'resolved' | 'worsened' | 'improved';
  ruleId: string;
  head: DeltaSnapshot | null;
  base: DeltaSnapshot | null;
};

type DeltaPath = {
  path: string;
  scoreDelta: number;
  addedCount: number;
  worsenedCount: number;
  resolvedCount: number;
  improvedCount: number;
  changes: DeltaChange[];
};

type DeltaRuleSummary = {
  ruleId: string;
  family: string;
  addedCount: number;
  worsenedCount: number;
  resolvedCount: number;
  improvedCount: number;
};

type DeltaSnapshot = {
  message: string;
  primaryLocation?: {
    line?: number;
  } | null;
} | null;

type DeltaReport = {
  summary: {
    baseFindingCount: number;
    headFindingCount: number;
    netFindingCount: number;
    baseRepoScore: number;
    headRepoScore: number;
    netRepoScore: number;
    addedCount: number;
    resolvedCount: number;
    worsenedCount: number;
    improvedCount: number;
    hasChanges: boolean;
  };
  warnings: Array<{
    message: string;
  }>;
  paths: DeltaPath[];
  rules: DeltaRuleSummary[];
};

type DeltaArgs = {
  basePath: string | null;
  baseRef: string | null;
  failOn: string | null;
  headPath: string;
  ignore: string[];
  json: boolean;
  top: number;
};

const DEFAULT_TOP = 8;
const ORIGIN_HEAD_PREFIX_RE = /^refs\/remotes\//u;
const VALID_FAIL_ON = new Set([
  'added',
  'resolved',
  'worsened',
  'improved',
  'any',
]);

type CommandOptions = {
  allowFailure?: boolean;
  cwd?: string;
  input?: Buffer;
};

const formatSigned = (value: number, digits = 2) => {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(digits)}`;
};

const formatSignedInt = (value: number) => {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}`;
};

const parseFailOn = (value: string | null) => {
  if (!value) {
    return [];
  }

  const statuses = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (statuses.length === 0) {
    throw new Error('Pass at least one status to --fail-on.');
  }

  for (const status of statuses) {
    if (!VALID_FAIL_ON.has(status)) {
      throw new Error(
        `Unknown --fail-on status: ${status}. Use added,resolved,worsened,improved,any.`
      );
    }
  }

  return statuses;
};

const shouldFailDelta = (report: DeltaReport, failOn: readonly string[]) => {
  if (failOn.length === 0) {
    return false;
  }

  for (const status of failOn) {
    switch (status) {
      case 'any':
        if (report.summary.hasChanges) {
          return true;
        }
        break;
      case 'added':
        if (report.summary.addedCount > 0) {
          return true;
        }
        break;
      case 'resolved':
        if (report.summary.resolvedCount > 0) {
          return true;
        }
        break;
      case 'worsened':
        if (report.summary.worsenedCount > 0) {
          return true;
        }
        break;
      case 'improved':
        if (report.summary.improvedCount > 0) {
          return true;
        }
        break;
    }
  }

  return false;
};

const run = (
  cmd: string[],
  { allowFailure = false, cwd = process.cwd(), input }: CommandOptions = {}
) => {
  const result = spawnSync(cmd[0]!, cmd.slice(1), {
    cwd,
    env: process.env,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (!allowFailure && result.status !== 0) {
    throw new Error(
      [
        `Command failed (${result.status ?? 'unknown'}): ${cmd.join(' ')}`,
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
};

const runBinary = (
  cmd: string[],
  { allowFailure = false, cwd = process.cwd(), input }: CommandOptions = {}
) => {
  const result = spawnSync(cmd[0]!, cmd.slice(1), {
    cwd,
    env: process.env,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (!allowFailure && result.status !== 0) {
    throw new Error(
      [
        `Command failed (${result.status ?? 'unknown'}): ${cmd.join(' ')}`,
        result.stderr.toString('utf8').trim(),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return {
    status: result.status ?? 1,
    stderr: result.stderr.toString('utf8'),
    stdout: result.stdout,
  };
};

const hasCommand = (cmd: string) =>
  run(['which', cmd], { allowFailure: true }).status === 0;

const getSlopCommand = () => {
  if (hasCommand('slop-scan')) {
    return ['slop-scan'];
  }

  return ['bunx', 'slop-scan'];
};

const getGitRoot = (cwd: string) => {
  const result = run(['git', 'rev-parse', '--show-toplevel'], {
    allowFailure: true,
    cwd,
  });

  return result.status === 0 ? result.stdout.trim() : null;
};

const resolveDefaultBaseRef = (cwd: string) => {
  if (process.env.SLOP_SCAN_BASE_REF) {
    return process.env.SLOP_SCAN_BASE_REF;
  }

  const symbolic = run(
    ['git', 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'],
    { allowFailure: true, cwd }
  );

  const candidates = [
    symbolic.stdout.trim().replace(ORIGIN_HEAD_PREFIX_RE, ''),
    'origin/main',
    'origin/master',
    'main',
    'master',
    'HEAD',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (
      run(['git', 'rev-parse', '--verify', candidate], {
        allowFailure: true,
        cwd,
      }).status === 0
    ) {
      return candidate;
    }
  }

  return 'HEAD';
};

const archiveTreeish = (cwd: string, treeish: string) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'kitcn-slop-base-'));
  const archivePath = path.join(tempDir, 'base.tar');

  try {
    run(['git', 'archive', '--output', archivePath, treeish], { cwd });
    runBinary(['tar', '-xf', archivePath, '-C', tempDir], { cwd });
    rmSync(archivePath, { force: true });
  } catch (error) {
    rmSync(tempDir, { force: true, recursive: true });
    throw error;
  }

  return tempDir;
};

const parseDeltaArgs = (argv: string[]): DeltaArgs => {
  const args: DeltaArgs = {
    basePath: null,
    baseRef: null,
    failOn: null,
    headPath: '.',
    ignore: [],
    json: false,
    top: DEFAULT_TOP,
  };

  const queue = [...argv];

  while (queue.length > 0) {
    const token = queue.shift()!;

    switch (token) {
      case '--base-path':
        args.basePath = queue.shift() ?? null;
        break;
      case '--base-ref':
        args.baseRef = queue.shift() ?? null;
        break;
      case '--fail-on':
        args.failOn = queue.shift() ?? null;
        break;
      case '--head':
        args.headPath = queue.shift() ?? '.';
        break;
      case '--ignore':
        args.ignore.push(queue.shift() ?? '');
        break;
      case '--json':
        args.json = true;
        break;
      case '--top':
        args.top = Number(queue.shift() ?? DEFAULT_TOP);
        break;
      default:
        throw new Error(`Unknown delta argument: ${token}`);
    }
  }

  if (!Number.isFinite(args.top) || args.top < 1) {
    throw new Error('--top must be a positive integer.');
  }

  return args;
};

const formatRuleLine = (rule: DeltaRuleSummary) => {
  const regressions = rule.addedCount + rule.worsenedCount;
  const improvements = rule.resolvedCount + rule.improvedCount;

  return [
    `- ${rule.ruleId}`,
    regressions > 0
      ? `regressions ${regressions} (added ${rule.addedCount}, worsened ${rule.worsenedCount})`
      : null,
    improvements > 0
      ? `improvements ${improvements} (resolved ${rule.resolvedCount}, improved ${rule.improvedCount})`
      : null,
  ]
    .filter(Boolean)
    .join('  ');
};

const describeChange = (change: DeltaChange) => {
  const snapshot = change.head ?? change.base;
  const message = snapshot?.message ?? 'no message';
  const line = snapshot?.primaryLocation?.line;
  return `  - ${change.status} ${change.ruleId}${line ? `:${line}` : ''} ${message}`;
};

export const formatDeltaSummary = (
  report: DeltaReport,
  options?: {
    baseLabel?: string;
    headLabel?: string;
    top?: number;
  }
) => {
  const top = options?.top ?? DEFAULT_TOP;
  const regressions = report.rules
    .filter((rule) => rule.addedCount + rule.worsenedCount > 0)
    .sort(
      (left, right) =>
        right.addedCount +
        right.worsenedCount -
        (left.addedCount + left.worsenedCount)
    );
  const improvements = report.rules
    .filter((rule) => rule.resolvedCount + rule.improvedCount > 0)
    .sort(
      (left, right) =>
        right.resolvedCount +
        right.improvedCount -
        (left.resolvedCount + left.improvedCount)
    );
  const hotPaths = report.paths
    .filter((entry) => entry.scoreDelta > 0)
    .sort((left, right) => right.scoreDelta - left.scoreDelta);
  const improvedPaths = report.paths
    .filter((entry) => entry.scoreDelta < 0)
    .sort((left, right) => left.scoreDelta - right.scoreDelta);

  const lines = [
    'deslop slop delta',
    options?.baseLabel ? `base: ${options.baseLabel}` : null,
    options?.headLabel ? `head: ${options.headLabel}` : null,
    `findings: ${report.summary.baseFindingCount} -> ${report.summary.headFindingCount} (${formatSignedInt(report.summary.netFindingCount)})`,
    `repo score: ${report.summary.baseRepoScore.toFixed(2)} -> ${report.summary.headRepoScore.toFixed(2)} (${formatSigned(report.summary.netRepoScore)})`,
    '',
    'Occurrence changes:',
    `- added: ${report.summary.addedCount}`,
    `- worsened: ${report.summary.worsenedCount}`,
    `- resolved: ${report.summary.resolvedCount}`,
    `- improved: ${report.summary.improvedCount}`,
  ].filter(Boolean) as string[];

  if (report.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of report.warnings) {
      lines.push(`- ${warning.message}`);
    }
  }

  if (!report.summary.hasChanges) {
    lines.push('', 'No occurrence-level changes.');
    return lines.join('\n');
  }

  if (regressions.length > 0) {
    lines.push('', 'Top regressions:');
    for (const rule of regressions.slice(0, top)) {
      lines.push(formatRuleLine(rule));
    }
  }

  if (hotPaths.length > 0) {
    lines.push('', 'Hot paths to clean:');
    for (const entry of hotPaths.slice(0, top)) {
      lines.push(
        `- ${entry.path}  Δscore ${formatSigned(entry.scoreDelta)}  added ${entry.addedCount}, worsened ${entry.worsenedCount}, resolved ${entry.resolvedCount}, improved ${entry.improvedCount}`
      );

      for (const change of entry.changes.slice(0, 2)) {
        lines.push(describeChange(change));
      }
    }
  }

  if (improvements.length > 0) {
    lines.push('', 'Largest improvements:');
    for (const rule of improvements.slice(0, top)) {
      lines.push(formatRuleLine(rule));
    }
  }

  if (improvedPaths.length > 0) {
    lines.push('', 'Paths already improved:');
    for (const entry of improvedPaths.slice(0, top)) {
      lines.push(
        `- ${entry.path}  Δscore ${formatSigned(entry.scoreDelta)}  added ${entry.addedCount}, worsened ${entry.worsenedCount}, resolved ${entry.resolvedCount}, improved ${entry.improvedCount}`
      );
    }
  }

  return lines.join('\n');
};

const runScan = (argv: string[]) => {
  let targetPath = '.';
  const forward: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--ignore') {
      forward.push(token, argv[index + 1] ?? '');
      index += 1;
      continue;
    }

    if (!token.startsWith('-') && targetPath === '.') {
      targetPath = token;
      continue;
    }

    forward.push(token);
  }

  if (!forward.includes('--json') && !forward.includes('--lint')) {
    forward.push('--lint');
  }

  const command = [...getSlopCommand(), 'scan', targetPath, ...forward];
  const result = run(command, { allowFailure: true });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  process.exit(result.status);
};

const runDelta = (argv: string[]) => {
  const args = parseDeltaArgs(argv);
  const cwd = process.cwd();
  const repoRoot = getGitRoot(cwd);

  if (!repoRoot && !args.basePath) {
    throw new Error(
      'lint:slop:delta needs a git repo or an explicit --base-path.'
    );
  }

  const baseRef =
    args.baseRef ?? (repoRoot ? resolveDefaultBaseRef(repoRoot) : null);
  const mergeBase =
    repoRoot && !args.basePath
      ? run(['git', 'merge-base', 'HEAD', baseRef ?? 'HEAD'], {
          allowFailure: true,
          cwd: repoRoot,
        }).stdout.trim() || 'HEAD'
      : null;
  const baseLabel =
    args.basePath ??
    (mergeBase
      ? `${baseRef} @ ${mergeBase.slice(0, 12)}`
      : 'explicit base path');
  const tempBaseDir =
    !args.basePath && repoRoot && mergeBase
      ? archiveTreeish(repoRoot, mergeBase)
      : null;
  const basePath = args.basePath ?? tempBaseDir;

  try {
    const deltaCommand = [
      ...getSlopCommand(),
      'delta',
      '--base',
      basePath!,
      '--head',
      args.headPath,
      '--json',
      ...args.ignore.flatMap((pattern) => ['--ignore', pattern]),
    ];
    const result = run(deltaCommand, {
      cwd: repoRoot ?? cwd,
    });
    const report = JSON.parse(result.stdout) as DeltaReport;

    if (args.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(
        `${formatDeltaSummary(report, {
          baseLabel,
          headLabel: path.resolve(args.headPath),
          top: args.top,
        })}\n`
      );
    }

    const failOn = parseFailOn(args.failOn);
    if (shouldFailDelta(report, failOn)) {
      process.exit(1);
    }
  } finally {
    if (tempBaseDir) {
      rmSync(tempBaseDir, { force: true, recursive: true });
    }
  }
};

const main = (argv: string[]) => {
  const [mode, ...rest] = argv;

  switch (mode) {
    case 'scan':
      runScan(rest);
      return;
    case 'delta':
      runDelta(rest);
      return;
    default:
      throw new Error('Usage: bun tooling/slop.ts <scan|delta> [options]');
  }
};

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown slop tooling error';
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
