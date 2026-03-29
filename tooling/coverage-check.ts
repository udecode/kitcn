import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

type FileCoverage = {
  file: string;
  fnf: number;
  fnh: number;
  da: number;
  dah: number;
};

const NEWLINE_RE = /\r?\n/;

function log(message: string) {
  process.stdout.write(`${message}\n`);
}

function logError(message: string) {
  process.stderr.write(`${message}\n`);
}

function mean(values: number[]) {
  if (values.length === 0) return 100;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(hit: number, total: number) {
  if (total === 0) return 100;
  return (hit / total) * 100;
}

function parseBunLcov(lcov: string): FileCoverage[] {
  const records: FileCoverage[] = [];

  let current: FileCoverage | null = null;
  for (const line of lcov.split(NEWLINE_RE)) {
    if (line.startsWith('SF:')) {
      if (current) records.push(current);
      current = {
        file: line.slice('SF:'.length),
        fnf: 0,
        fnh: 0,
        da: 0,
        dah: 0,
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith('FNF:')) {
      current.fnf = Number.parseInt(line.slice('FNF:'.length), 10);
      continue;
    }

    if (line.startsWith('FNH:')) {
      current.fnh = Number.parseInt(line.slice('FNH:'.length), 10);
      continue;
    }

    // Bun's lcov output uses DA entries as the effective denominator for % Lines
    // shown in `bun test --coverage` (not LF/LH which count physical lines).
    if (line.startsWith('DA:')) {
      current.da += 1;
      const hits = Number.parseInt(line.split(',')[1] ?? '0', 10);
      if (hits > 0) current.dah += 1;
      continue;
    }

    if (line === 'end_of_record') {
      records.push(current);
      current = null;
    }
  }

  if (current) records.push(current);
  return records;
}

function requireMin(ok: boolean, message: string): ok is true {
  if (ok) return true;
  logError(message);
  process.exitCode = 1;
  return false;
}

async function run(cmd: string, args: string[]) {
  const child = Bun.spawn({
    cmd: [cmd, ...args],
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  const exitCode = await child.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

async function main() {
  const projectRoot = process.cwd();

  const bunCoverageDir = path.join(projectRoot, 'coverage', 'bun');
  rmSync(bunCoverageDir, { recursive: true, force: true });

  log('');
  log('[coverage] Bun (packages/*) -> lcov');
  await run('bun', [
    'test',
    '--coverage',
    '--coverage-reporter=lcov',
    `--coverage-dir=${bunCoverageDir}`,
  ]);

  const bunLcovPath = path.join(bunCoverageDir, 'lcov.info');
  const bunLcov = readFileSync(bunLcovPath, 'utf8');
  const bunRecords = parseBunLcov(bunLcov);

  const includedPrefix = 'packages/kitcn/src/';
  const included = bunRecords.filter(
    (r) =>
      r.file.startsWith(includedPrefix) &&
      !r.file.startsWith(`${includedPrefix}orm/`)
  );

  const perFileLinePct = included.map((r) => pct(r.dah, r.da));
  const perFileFuncPct = included.map((r) => pct(r.fnh, r.fnf));

  const bunNonOrmLineMean = mean(perFileLinePct);
  const bunNonOrmFuncMean = mean(perFileFuncPct);

  log(
    `[coverage] Bun non-ORM mean: lines=${bunNonOrmLineMean.toFixed(2)} funcs=${bunNonOrmFuncMean.toFixed(2)} files=${included.length}`
  );

  // Overall floors for non-Convex-test surfaces.
  requireMin(
    bunNonOrmLineMean >= 85,
    `[coverage] FAIL: Bun non-ORM mean lines ${bunNonOrmLineMean.toFixed(2)} < 85`
  );
  requireMin(
    bunNonOrmFuncMean >= 85,
    `[coverage] FAIL: Bun non-ORM mean funcs ${bunNonOrmFuncMean.toFixed(2)} < 85`
  );

  // Per-file floors for high-risk public surfaces (ship-readiness).
  const criticalFloors: Record<string, { minLines: number; minFuncs: number }> =
    {
      'packages/kitcn/src/react/client.ts': {
        minLines: 25,
        minFuncs: 30,
      },
      'packages/kitcn/src/server/builder.ts': {
        minLines: 50,
        minFuncs: 45,
      },
      'packages/kitcn/src/auth/create-api.ts': {
        minLines: 40,
        minFuncs: 75,
      },
      'packages/kitcn/src/cli/env.ts': { minLines: 50, minFuncs: 100 },
    };

  for (const [file, floors] of Object.entries(criticalFloors)) {
    const rec = included.find((r) => r.file === file);
    if (!rec) {
      requireMin(false, `[coverage] FAIL: Missing coverage record for ${file}`);
      continue;
    }

    const linePct = pct(rec.dah, rec.da);
    const funcPct = pct(rec.fnh, rec.fnf);

    requireMin(
      linePct >= floors.minLines,
      `[coverage] FAIL: ${file} lines ${linePct.toFixed(2)} < ${floors.minLines}`
    );
    requireMin(
      funcPct >= floors.minFuncs,
      `[coverage] FAIL: ${file} funcs ${funcPct.toFixed(2)} < ${floors.minFuncs}`
    );
  }

  log('');
  log('[coverage] Vitest (convex-test ORM) thresholds');
  await run('bunx', [
    'vitest',
    'run',
    '--coverage',
    '--coverage.include=packages/kitcn/src/orm/**/*.ts',
    '--coverage.reporter=text',
    '--coverage.thresholds.lines=75',
    '--coverage.thresholds.functions=80',
    '--coverage.thresholds.branches=60',
    '--coverage.thresholds.statements=70',
  ]);

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }

  log('');
  log('[coverage] OK');
}

await main();
