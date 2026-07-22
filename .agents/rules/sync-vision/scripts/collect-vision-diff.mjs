#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../../..');
const syncDir = path.join(repoRoot, 'docs/sync/vision');
const statusPath = path.join(syncDir, 'status.json');
const args = process.argv.slice(2);
const diffHunkPattern = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const newlinePattern = /\r?\n/;

const sourcePathspecs = [
  'VISION.md',
  '.agents/AGENTS.md',
  '.agents/rules',
  'docs/plans',
  'docs/sync',
  'docs/adr',
  'docs/analysis',
  'docs/brainstorms',
  'docs/milestones',
  'docs/orm',
  'docs/prds',
  'docs/research',
  'docs/solutions',
  '*.md',
  '*.mdx',
  '*.mdc',
];

const excludedPathPrefixes = [
  '.agents/skills/',
  '.claude/skills/',
  '.changeset/',
  'docs/sync/vision/runs/',
  'fixtures/',
  'tmp/',
  'node_modules/',
  'dist/',
  'build/',
];

const excludedExactPaths = new Set(['docs/sync/vision/status.json']);

const exactInputFiles = new Set([
  'VISION.md',
  '.agents/AGENTS.md',
  'docs/README.md',
]);

const inputPathPrefixes = [
  '.agents/rules/',
  'docs/plans/',
  'docs/sync/',
  'docs/adr/',
  'docs/analysis/',
  'docs/brainstorms/',
  'docs/milestones/',
  'docs/orm/',
  'docs/prds/',
  'docs/research/',
  'docs/solutions/',
];

const trackedExts = new Set([
  '.md',
  '.mdx',
  '.mdc',
  '.json',
  '.jsonl',
  '.tsv',
  '.txt',
]);

const patterns = {
  vision: /\b(VISION\.md|vision|north[- ]star|taste|doctrine)\b/i,
  supervisor:
    /\b(sync-vision|autogoal|auto|autoclosure|architecture-cleanup|checkpoint|stopping|handoff|packet|timed|supervisor|loop)\b/i,
  product:
    /\b(kitcn|developer experience|DX|public API|plugin|scaffold|fixture|scenario|release|compatibility|hard cut)\b/i,
  model:
    /\b(cRPC|ORM|Drizzle|tRPC|TanStack|Convex|schema|model|canonical|entity|query|mutation|subscription|transaction)\b/i,
  source:
    /\b(source|package|export|entry point|import graph|bundle|CLI|template|generated|integration|adapter|API|webhook|sync)\b/i,
  ai: /\b(AI|agent|draft|recommendation|finding|summary|tool|prompt|LLM|inference|confidence)\b/i,
  research:
    /\b(research|source[- ]mining|matrix|corpus|raw|compiled|finding|decision|open question)\b/i,
  workflow:
    /\b(GitHub|PR|ledger|checkmark|triage|decision ledger|open question|grill|PRD|milestone|prototype)\b/i,
  proof:
    /\b(proof|benchmark|metric|p95|test|fixture|scenario|verify|verification|typecheck|build|Browser)\b/i,
};

function runGit(gitArgs, options = {}) {
  const result = spawnSync('git', gitArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${gitArgs.join(' ')} failed`);
  }
  return result.stdout.trimEnd();
}

function parseArgs() {
  const parsed = {
    statusOnly: false,
    dryRun: false,
    advance: false,
    includeWorkingTree: true,
    base: null,
    target: null,
    plan: null,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--status' || arg === 'status') parsed.statusOnly = true;
    else if (arg === '--dry-run' || arg === '--preview' || arg === 'preview') {
      parsed.dryRun = true;
    } else if (arg === '--advance' || arg === 'advance') parsed.advance = true;
    else if (arg === '--no-working-tree') parsed.includeWorkingTree = false;
    else if (arg === '--base' || arg === '--since') parsed.base = args[++i];
    else if (arg === '--target') parsed.target = args[++i];
    else if (arg === '--plan') parsed.plan = args[++i];
    else {
      throw new Error(`Unknown argument: ${arg}`);
    }
    i += 1;
  }

  return parsed;
}

function readStatus() {
  if (!fs.existsSync(statusPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function runNodeScript(scriptPath, planPath) {
  const result = spawnSync(process.execPath, [scriptPath, planPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || `${scriptPath} failed`).trim()
    );
  }
}

function validateAdvancePlan(planArg, base, target, committedFiles) {
  const planPath = path.resolve(repoRoot, planArg);
  const relativePlanPath = rel(planPath);

  if (
    relativePlanPath.startsWith('../') ||
    path.isAbsolute(relativePlanPath) ||
    !relativePlanPath.startsWith('docs/plans/') ||
    path.extname(relativePlanPath) !== '.md' ||
    !fs.existsSync(planPath)
  ) {
    throw new Error(`invalid --plan path: ${planArg}`);
  }

  runNodeScript(
    path.join(
      repoRoot,
      '.agents/rules/auto/scripts/check-plan-placeholders.mjs'
    ),
    relativePlanPath
  );
  runNodeScript(
    path.join(repoRoot, '.agents/skills/autogoal/scripts/check-complete.mjs'),
    relativePlanPath
  );

  const plan = fs.readFileSync(planPath, 'utf8');
  const missingCommitIds = [base, target].filter(
    (commit) => !plan.includes(commit) && !plan.includes(shortSha(commit))
  );
  if (missingCommitIds.length > 0) {
    throw new Error(
      `advance plan must record base and target commits: ${missingCommitIds.join(', ')}`
    );
  }

  const missingFiles = [
    ...new Set(committedFiles.map(({ file }) => file)),
  ].filter((file) => !plan.includes(file));
  if (missingFiles.length > 0) {
    throw new Error(
      `advance plan must classify every committed candidate file: ${missingFiles.join(', ')}`
    );
  }
}

function rel(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
}

function isRelevantFile(file) {
  if (!file) return false;
  if (excludedExactPaths.has(file)) return false;
  if (excludedPathPrefixes.some((prefix) => file.startsWith(prefix))) {
    return false;
  }
  const ext = path.extname(file);
  if (!trackedExts.has(ext) && file !== 'VISION.md') {
    return false;
  }
  return (
    exactInputFiles.has(file) ||
    inputPathPrefixes.some((prefix) => file.startsWith(prefix)) ||
    (!file.includes('/') && ['.md', '.mdx', '.mdc'].includes(ext))
  );
}

function pathspecArgs() {
  return ['--', ...sourcePathspecs];
}

function parseNameStatus(text, source) {
  if (!text.trim()) return [];
  return text.split('\n').flatMap((line) => {
    const parts = line.split('\t');
    const status = parts[0] ?? '';
    const file = parts[2] ?? parts[1] ?? '';
    if (!isRelevantFile(file)) return [];
    return [{ source, status, file }];
  });
}

function parseUntrackedFiles(text, source) {
  if (!text.trim()) return [];
  return text.split('\n').flatMap((file) => {
    if (!isRelevantFile(file)) return [];
    return [{ source, status: '??', file }];
  });
}

function categoryHits(text) {
  const hits = [];
  for (const [name, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) hits.push(name);
  }
  return hits;
}

function parseAddedLines(diffText, source) {
  const rows = [];
  let file = '';
  let newLine = 0;

  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice('+++ b/'.length);
      continue;
    }
    if (line.startsWith('+++ /dev/null')) {
      file = '';
      continue;
    }
    const hunk = diffHunkPattern.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!file || !isRelevantFile(file)) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const text = line.slice(1).trim();
      const hits = categoryHits(text);
      if (hits.length > 0) {
        rows.push({
          source,
          categories: hits.join(','),
          file,
          line: newLine,
          text: text.replace(/\s+/g, ' ').slice(0, 500),
        });
      }
      newLine += 1;
    } else if (!line.startsWith('-') && !line.startsWith('\\')) {
      newLine += 1;
    }
  }

  return rows;
}

function parseFileLines(files, source) {
  const rows = [];

  for (const file of files) {
    const absolutePath = path.join(repoRoot, file.file);

    if (!fs.existsSync(absolutePath)) continue;

    const lines = fs.readFileSync(absolutePath, 'utf8').split(newlinePattern);

    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index].trim();
      const hits = categoryHits(text);

      if (hits.length === 0) continue;

      rows.push({
        source,
        categories: hits.join(','),
        file: file.file,
        line: index + 1,
        text: text.replace(/\s+/g, ' ').slice(0, 500),
      });
    }
  }

  return rows;
}

function shortSha(sha) {
  return sha ? sha.slice(0, 7) : '';
}

function makeRunDir(base, target) {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(
    syncDir,
    'runs',
    `${date}-${shortSha(base)}-to-${shortSha(target)}`
  );
}

function writeTsv(filePath, header, rows) {
  const escapeTsv = (value) =>
    String(value ?? '')
      .replace(/\t/g, ' ')
      .replace(/\r?\n/g, ' ');
  const text = [
    header.join('\t'),
    ...rows.map((row) => header.map((key) => escapeTsv(row[key])).join('\t')),
  ].join('\n');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${text}\n`);
}

function summarizeCounts(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    for (const value of String(row[key] ?? '')
      .split(',')
      .filter(Boolean)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
}

function main() {
  const options = parseArgs();
  if (options.advance && (options.dryRun || options.statusOnly)) {
    throw new Error('--advance cannot be combined with --preview or --status');
  }
  const status = readStatus();
  const targetRef = options.target ?? 'HEAD';
  const baseRef =
    options.base ??
    status.lastSyncedCommit ??
    runGit(['rev-list', '--max-parents=0', '--max-count=1', 'HEAD']);
  const target = runGit(['rev-parse', '--verify', `${targetRef}^{commit}`]);
  const base = runGit(['rev-parse', '--verify', `${baseRef}^{commit}`]);

  const committedNameStatus = runGit([
    'diff',
    '--name-status',
    '-M',
    base,
    target,
    ...pathspecArgs(),
  ]);
  const committedFiles = parseNameStatus(committedNameStatus, 'committed');
  const committedDiff = runGit([
    'diff',
    '--unified=0',
    '--no-ext-diff',
    base,
    target,
    ...pathspecArgs(),
  ]);
  const committedCandidates = parseAddedLines(committedDiff, 'committed');

  let workingFiles = [];
  let workingCandidates = [];
  if (options.includeWorkingTree && target === runGit(['rev-parse', 'HEAD'])) {
    const workingNameStatus = runGit([
      'diff',
      '--name-status',
      '-M',
      target,
      ...pathspecArgs(),
    ]);
    workingFiles = parseNameStatus(workingNameStatus, 'working-tree');
    const workingDiff = runGit([
      'diff',
      '--unified=0',
      '--no-ext-diff',
      target,
      ...pathspecArgs(),
    ]);
    workingCandidates = parseAddedLines(workingDiff, 'working-tree');
    const untracked = parseUntrackedFiles(
      runGit(['ls-files', '--others', '--exclude-standard', ...pathspecArgs()]),
      'working-tree'
    );
    workingFiles = [...workingFiles, ...untracked];
    workingCandidates = [
      ...workingCandidates,
      ...parseFileLines(untracked, 'working-tree'),
    ];
  }

  const changedFiles = [...committedFiles, ...workingFiles];
  const candidateLines = [...committedCandidates, ...workingCandidates];

  const statusSummary = {
    statusPath: rel(statusPath),
    base,
    target,
    committedChangedFiles: committedFiles.length,
    committedCandidateLines: committedCandidates.length,
    workingTreeChangedFiles: workingFiles.length,
    workingTreeCandidateLines: workingCandidates.length,
    lastRunDir: status.lastRunDir ?? null,
    pendingRunDir: status.pendingRunDir ?? null,
  };

  if (options.statusOnly) {
    process.stdout.write(`${JSON.stringify(statusSummary, null, 2)}\n`);
    return;
  }

  const runDir = makeRunDir(base, target);
  const categoryCounts = summarizeCounts(candidateLines, 'categories');
  const runJson = {
    ...statusSummary,
    runDir: rel(runDir),
    candidateCategoryCounts: Object.fromEntries(categoryCounts),
    generatedAt: new Date().toISOString(),
    plan: options.plan ?? null,
  };

  if (options.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ...runJson,
          advanced: false,
          changedFiles,
          candidateLines,
          preview: true,
          runDir: null,
        },
        null,
        2
      )}\n`
    );
    return;
  }

  if (options.advance) {
    if (!options.plan) {
      throw new Error('--advance requires --plan <docs/plans/...>');
    }
    validateAdvancePlan(options.plan, base, target, committedFiles);
  }

  fs.mkdirSync(runDir, { recursive: true });

  writeTsv(
    path.join(runDir, 'changed-files.tsv'),
    ['source', 'status', 'file'],
    changedFiles
  );
  writeTsv(
    path.join(runDir, 'candidate-lines.tsv'),
    ['source', 'categories', 'file', 'line', 'text'],
    candidateLines
  );

  const summary = [
    '# Vision Sync Summary',
    '',
    `- Base: \`${base}\``,
    `- Target: \`${target}\``,
    `- Committed changed files: ${committedFiles.length}`,
    `- Committed candidate lines: ${committedCandidates.length}`,
    `- Working-tree changed files: ${workingFiles.length}`,
    `- Working-tree candidate lines: ${workingCandidates.length}`,
    `- Dry run: ${options.dryRun ? 'yes' : 'no'}`,
    `- Advanced baseline: ${options.advance ? 'requested' : 'no'}`,
    '',
    '## Candidate Categories',
    '',
    '| Category | Lines |',
    '| --- | ---: |',
    ...categoryCounts.map(([name, count]) => `| ${name} | ${count} |`),
    '',
    '## Next',
    '',
    '- Read `candidate-lines.tsv` and the owning changed files.',
    '- Cluster candidates into captured, reaffirmed, rejected, run-specific, owner-routed, or deferred-with-question.',
    '- Patch root `VISION.md` only for reusable current-state doctrine.',
    '- Advance `lastSyncedCommit` only after the committed range is fully accounted for.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(runDir, 'summary.md'), summary);

  writeJson(path.join(runDir, 'run.json'), runJson);

  if (options.advance) {
    const nextStatus = {
      schemaVersion: 1,
      initializedAt: status.initializedAt ?? new Date().toISOString(),
      lastSyncedCommit: target,
      lastSyncedAt: new Date().toISOString(),
      lastTargetCommit: target,
      lastRunDir: rel(runDir),
      pendingRunDir: workingFiles.length > 0 ? rel(runDir) : null,
      lastPlan: options.plan,
      notes: [
        'lastSyncedCommit accounts for committed inputs only.',
        'Working-tree overlay is visible in run artifacts but not baselined until committed.',
      ],
    };
    writeJson(statusPath, nextStatus);
  }

  process.stdout.write(
    `${JSON.stringify({ ...runJson, advanced: options.advance }, null, 2)}\n`
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
