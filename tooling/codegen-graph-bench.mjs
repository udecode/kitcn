#!/usr/bin/env node
// Cost of `kitcn codegen`'s module parse on a synthetic project, one fresh
// process and one cold jiti cache per sample.
//
//   node tooling/codegen-graph-bench.mjs [--pkg packages/kitcn] [--runs 5]
//     [--modules 200] [--shared 100]
//
// The project has `--modules` Convex modules, each exporting one procedure and
// importing the top of a chain of `--shared` helper modules. Each helper
// appends a line to a log when it evaluates, so a sample reports how many
// helper evaluations one codegen run made, beside its wall time.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const pkg = path.resolve(option('pkg', 'packages/kitcn'));
const runs = Number(option('runs', '5'));
const moduleCount = Number(option('modules', '200'));
const sharedCount = Number(option('shared', '100'));

const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

const project = (dir, log) => {
  write(
    path.join(dir, 'node_modules', 'kitcn', 'package.json'),
    JSON.stringify({
      name: 'kitcn',
      type: 'module',
      exports: { './server': './server.js' },
    })
  );
  write(
    path.join(dir, 'node_modules', 'kitcn', 'server.js'),
    'export const registerProcedureNameLookup = () => {};\n'
  );
  write(
    path.join(dir, 'convex', 'schema.ts'),
    'export default { tables: {} };\n'
  );
  for (let i = 0; i < sharedCount; i += 1)
    write(
      path.join(dir, 'convex', 'lib', 'shared', `s${i}.ts`),
      `import fs from 'node:fs';
${i > 0 ? `import { table as previous } from './s${i - 1}';\n` : 'const previous = {};\n'}fs.appendFileSync(${JSON.stringify(log)}, 's${i}\\n');
export const table = { ...previous, ${Array.from({ length: 20 }, (_, k) => `f${i}_${k}: { index: ${k} }`).join(', ')} };
`
    );
  for (let j = 0; j < moduleCount; j += 1)
    write(
      path.join(dir, 'convex', `m${j}.ts`),
      `import { table } from './lib/shared/s${sharedCount - 1}';
void table;
export const q${j} = { _crpcMeta: { type: 'query' } };
`
    );
};

const sample = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-codegen-bench-'));
  const dir = path.join(root, 'project');
  const tmp = path.join(root, 'tmp');
  const log = path.join(root, 'evaluations.log');
  fs.mkdirSync(tmp);
  project(dir, log);
  const start = process.hrtime.bigint();
  const result = spawnSync(
    'bun',
    [
      '--cwd',
      pkg,
      '-e',
      'import { generateMeta } from "./src/cli/codegen.ts"; process.chdir(process.argv[1]); await generateMeta(undefined, { silent: true });',
      dir,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: tmp, JITI_TRY_NATIVE: '0' },
    }
  );
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`generateMeta exited ${result.status}`);
  }
  const evaluations = fs.existsSync(log)
    ? fs.readFileSync(log, 'utf8').trim().split('\n').length
    : 0;
  fs.rmSync(root, { force: true, recursive: true });
  return { ms, evaluations };
};

const samples = Array.from({ length: runs }, sample);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
process.stdout.write(
  `${JSON.stringify({
    pkg,
    modules: moduleCount,
    shared: sharedCount,
    runs,
    p50Ms: Math.round(median(samples.map((s) => s.ms))),
    helperEvaluations: median(samples.map((s) => s.evaluations)),
  })}\n`
);
