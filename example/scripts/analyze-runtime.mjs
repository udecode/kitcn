import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const projectRoot = process.cwd();
const convexRoot = path.join(projectRoot, 'convex');
const generatedRoot = path.join(convexRoot, 'functions', 'generated');
const functionsRoot = path.join(convexRoot, 'functions');

const MB = 1024 * 1024;
const WARNING_MB = 6;
const DANGER_MB = 8;

const walk = (dir) => {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.runtime.ts')) {
      files.push(fullPath);
    }
  }
  return files;
};

const walkFunctionModules = (dir) => {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'generated' || entry.name === '_generated') {
        continue;
      }
      files.push(...walkFunctionModules(fullPath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!/\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
};

const dedupe = (values) => Array.from(new Set(values));

const formatBytes = (bytes) => `${(bytes / MB).toFixed(2)} MB`;

const toMB = (bytes) => (bytes / MB).toFixed(2);

const truncate = (value, maxWidth) => {
  if (value.length <= maxWidth) {
    return value;
  }
  if (maxWidth <= 3) {
    return value.slice(0, maxWidth);
  }
  return `${value.slice(0, maxWidth - 3)}...`;
};

const pad = (value, width, align = 'left') => {
  if (align === 'right') {
    return value.padStart(width, ' ');
  }
  return value.padEnd(width, ' ');
};

const formatSeverity = (outputBytes) => {
  const outputMB = outputBytes / MB;
  if (outputMB >= DANGER_MB) {
    return 'DANGER';
  }
  if (outputMB >= WARNING_MB) {
    return 'WARN';
  }
  return 'OK';
};

const firstLine = (value) => value.split('\n').at(0) ?? value;

const analyzeEntry = async (entryPoint) => {
  const result = await build({
    bundle: true,
    entryPoints: [entryPoint],
    external: ['convex', 'convex/*'],
    format: 'esm',
    logLevel: 'silent',
    metafile: true,
    platform: 'node',
    target: ['es2022'],
    write: false,
  });

  const output = Object.values(result.metafile.outputs)[0];
  if (!output) {
    throw new Error(`No output generated for ${entryPoint}`);
  }

  const inputs = Object.entries(result.metafile.inputs);
  const totalInputBytes = inputs.reduce((sum, [, value]) => sum + (value.bytes ?? 0), 0);
  const isLocalInput = (inputPath) =>
    inputPath.startsWith('convex/') ||
    inputPath.startsWith('example/convex/') ||
    inputPath.includes('/example/convex/');
  const localInputBytes = inputs
    .filter(([inputPath]) => isLocalInput(inputPath))
    .reduce((sum, [, value]) => sum + (value.bytes ?? 0), 0);

  return {
    entry: path.relative(projectRoot, entryPoint),
    inputCount: inputs.length,
    localInputBytes,
    outputBytes: output.bytes,
    totalInputBytes,
  };
};

const run = async () => {
  if (!fs.existsSync(generatedRoot)) {
    throw new Error(`Missing generated runtime directory: ${generatedRoot}`);
  }
  if (!fs.existsSync(functionsRoot)) {
    throw new Error(`Missing functions directory: ${functionsRoot}`);
  }

  const runtimeEntries = walk(generatedRoot);
  const functionModuleEntries = walkFunctionModules(functionsRoot);

  const entryPoints = dedupe([...runtimeEntries, ...functionModuleEntries]);
  if (entryPoints.length === 0) {
    console.log('No runtime entries found. Run `better-convex codegen` first.');
    return;
  }

  const rows = [];
  for (const entryPoint of entryPoints) {
    try {
      rows.push(await analyzeEntry(entryPoint));
    } catch (error) {
      rows.push({
        entry: path.relative(projectRoot, entryPoint),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const successRows = rows
    .filter((row) => !('error' in row))
    .sort((a, b) => b.outputBytes - a.outputBytes);

  const failedRows = rows.filter((row) => 'error' in row);

  const outputTotal = successRows.reduce((sum, row) => sum + row.outputBytes, 0);
  const outputAverage = successRows.length > 0 ? outputTotal / successRows.length : 0;
  const largest = successRows.at(0);
  const highRiskRows = successRows.filter((row) => row.outputBytes / MB >= WARNING_MB);

  console.log('Runtime bundle size analysis');
  console.log(
    `entries=${entryPoints.length} ok=${successRows.length} failed=${failedRows.length} avg=${formatBytes(
      outputAverage
    )}${largest ? ` largest=${largest.entry} (${formatBytes(largest.outputBytes)})` : ''}`
  );
  console.log('');

  if (successRows.length > 0) {
    const widths = {
      rank: 4,
      sev: 7,
      output: 7,
      allInputs: 9,
      localInputs: 9,
      inputCount: 6,
      entry: Math.max(
        30,
        Math.min(
          70,
          Math.max(...successRows.map((row) => row.entry.length), 'Entry'.length)
        )
      ),
    };

    const divider = [
      '-'.repeat(widths.rank),
      '-'.repeat(widths.sev),
      '-'.repeat(widths.output),
      '-'.repeat(widths.allInputs),
      '-'.repeat(widths.localInputs),
      '-'.repeat(widths.inputCount),
      '-'.repeat(widths.entry),
    ].join('  ');

    const header = [
      pad('Rank', widths.rank, 'right'),
      pad('Level', widths.sev),
      pad('OutMB', widths.output, 'right'),
      pad('AllInMB', widths.allInputs, 'right'),
      pad('LocalMB', widths.localInputs, 'right'),
      pad('Files', widths.inputCount, 'right'),
      pad('Entry', widths.entry),
    ].join('  ');

    console.log(header);
    console.log(divider);

    for (const [index, row] of successRows.entries()) {
      console.log(
        [
          pad(String(index + 1), widths.rank, 'right'),
          pad(formatSeverity(row.outputBytes), widths.sev),
          pad(toMB(row.outputBytes), widths.output, 'right'),
          pad(toMB(row.totalInputBytes), widths.allInputs, 'right'),
          pad(toMB(row.localInputBytes), widths.localInputs, 'right'),
          pad(String(row.inputCount), widths.inputCount, 'right'),
          pad(truncate(row.entry, widths.entry), widths.entry),
        ].join('  ')
      );
    }
  }

  if (highRiskRows.length > 0) {
    console.log('');
    console.log(`High-risk entries (>= ${WARNING_MB} MB):`);
    for (const row of highRiskRows) {
      console.log(`- ${row.entry}: ${formatBytes(row.outputBytes)}`);
    }
  }

  if (failedRows.length > 0) {
    console.log('\nFailed entries:');
    for (const row of failedRows) {
      const errorLine = firstLine(row.error);
      console.log(`- ${row.entry}: ${truncate(errorLine, 180)}`);
    }
    process.exitCode = 1;
  }
};

await run();
