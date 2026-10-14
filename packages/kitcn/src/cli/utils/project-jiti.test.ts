import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createMissingModuleResolver,
  createProjectJiti,
  registerMissingModuleFallback,
} from './project-jiti';

describe('cli/utils/project-jiti', () => {
  test('forces tryNative off for project parse-time imports', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-project-jiti-'));
    const previous = process.env.JITI_TRY_NATIVE;

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'project-jiti-test', private: true }, null, 2)
    );

    try {
      process.env.JITI_TRY_NATIVE = 'true';

      const jiti = createProjectJiti(dir);

      expect(jiti.options.tryNative).toBe(false);
    } finally {
      if (previous === undefined) {
        process.env.JITI_TRY_NATIVE = undefined;
      } else {
        process.env.JITI_TRY_NATIVE = previous;
      }
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  test('resolves missing project imports through a registered fallback until released', async () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-project-jiti-'))
    );
    const entryFile = path.join(dir, 'entry.ts');
    const fallbackFile = path.join(dir, 'outside', 'missing.ts');
    fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'present.ts'),
      'export const value = "present";'
    );
    fs.writeFileSync(fallbackFile, 'export const value = "fallback";');
    fs.writeFileSync(
      entryFile,
      `import { value as missing } from './missing';
import { value as present } from './present';
export const values = [missing, present];`
    );
    const requests: string[] = [];

    try {
      const release = registerMissingModuleFallback((request, parentFile) => {
        requests.push(request);
        return request === './missing' && parentFile === entryFile
          ? fallbackFile
          : undefined;
      });
      try {
        const module = (await createProjectJiti(dir).import(entryFile)) as {
          values: string[];
        };
        expect(module.values).toEqual(['fallback', 'present']);
      } finally {
        release();
      }
      expect(requests).toEqual(['./missing']);
      expect(fs.existsSync(path.join(dir, 'missing.ts'))).toBe(false);

      await expect(createProjectJiti(dir).import(entryFile)).rejects.toThrow(
        './missing'
      );
    } finally {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  test('preserves computed requests, normal requires, and scoped fallback release', async () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-project-jiti-'))
    );
    const entryFile = path.join(dir, 'entry.ts');
    const fallbackFile = path.join(dir, 'fallback.ts');
    fs.writeFileSync(fallbackFile, 'export const value = "fallback";');
    fs.writeFileSync(
      entryFile,
      `const Symbol = 'local symbol';
const globalThis = 'local global';
const name = './missing';
const sync = require(name);
const ordinary = require('node:path').basename('/a/b');
export const paths = [require.resolve(name), import.meta.resolve(name)];
export const failure = await import('./absent').catch(() => 'caught');
export const values = [sync.value, (await import(name)).value, ordinary, Symbol, globalThis];`
    );
    const releaseUnused = registerMissingModuleFallback(() => undefined);
    const release = registerMissingModuleFallback((request, parentFile) =>
      request === './missing' && parentFile === entryFile
        ? fallbackFile
        : undefined
    );
    try {
      releaseUnused();
      const jiti = createProjectJiti(dir);
      const module = await jiti.import<{
        values: string[];
        paths: string[];
        failure: string;
      }>(entryFile);
      expect(module.values).toEqual([
        'fallback',
        'fallback',
        'b',
        'local symbol',
        'local global',
      ]);
      expect(module.paths).toEqual([
        fallbackFile,
        pathToFileURL(fallbackFile).href,
      ]);
      expect(module.failure).toBe('caught');
      release();
      await expect(jiti.import(entryFile)).rejects.toThrow('./missing');
    } finally {
      releaseUnused();
      release();
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  test('loads JavaScript helpers once per import graph before resolving missing runtimes', async () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-project-jiti-'))
    );
    const entryFile = path.join(dir, 'entry.ts');
    const fallbackFile = path.join(dir, 'fallback.ts');
    const counterFile = path.join(dir, 'counter.txt');
    fs.writeFileSync(fallbackFile, 'export const value = "fallback";');
    fs.writeFileSync(
      path.join(dir, 'helper.cjs'),
      `const fs = require('node:fs');
const counter = ${JSON.stringify(counterFile)};
const count = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) + 1 : 1;
fs.writeFileSync(counter, String(count));
exports.count = count;
exports.runtime = require('./missing').value;
exports.cycle = require('./cycle.cjs').count;`
    );
    fs.writeFileSync(
      path.join(dir, 'cycle.cjs'),
      "exports.count = require('./helper.cjs').count;"
    );
    fs.writeFileSync(
      entryFile,
      `import * as helper from './helper.cjs';
import * as again from './helper.cjs';
export const values = [helper.count, again.count, helper.cycle, helper.runtime];`
    );
    const release = registerMissingModuleFallback((request) =>
      request === './missing' ? fallbackFile : undefined
    );
    try {
      const jiti = createProjectJiti(dir);
      expect(await jiti.import(entryFile)).toEqual({
        values: [1, 1, 1, 'fallback'],
      });
      expect(fs.readFileSync(counterFile, 'utf8')).toBe('1');
      expect(await jiti.import(entryFile)).toEqual({
        values: [2, 2, 2, 'fallback'],
      });
      expect(fs.readFileSync(counterFile, 'utf8')).toBe('2');
    } finally {
      release();
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  test('unwraps default exports exactly once with and without active fallbacks', async () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-project-jiti-'))
    );
    const entryFile = path.join(dir, 'entry.ts');
    fs.writeFileSync(
      entryFile,
      "export default { default: 'inner', value: 'outer' };"
    );
    try {
      const jiti = createProjectJiti(dir);
      expect(await jiti.import(entryFile, { default: true })).toEqual({
        default: 'inner',
        value: 'outer',
      });
      const release = registerMissingModuleFallback(() => undefined);
      try {
        expect(await jiti.import(entryFile, { default: true })).toEqual({
          default: 'inner',
          value: 'outer',
        });
      } finally {
        release();
      }
    } finally {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  test('keeps TypeScript ambient type resolution anchored after a temporary project lookup', () => {
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-project-jiti-'))
    );
    const entryFile = path.join(dir, 'entry.ts');
    const runtimeFile = path.join(dir, 'missing.runtime.ts');
    const rootDir = fileURLToPath(new URL('../../../../../', import.meta.url));
    fs.writeFileSync(entryFile, 'process.cwd();');
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ imports: { '#runtime': './missing.runtime.ts' } })
    );
    try {
      // A child starts with an untouched TypeScript cwd memo, unlike this suite.
      const result = Bun.spawnSync(
        [
          process.execPath,
          '--eval',
          `import ts from 'typescript';
import { createMissingModuleResolver } from ${JSON.stringify(new URL('./project-jiti.ts', import.meta.url).href)};
process.chdir(${JSON.stringify(dir)});
const target = createMissingModuleResolver()('#runtime', ${JSON.stringify(entryFile)});
if (target !== ${JSON.stringify(runtimeFile)}) throw new Error('missing runtime lookup did not run');
process.chdir(${JSON.stringify(rootDir)});
const program = ts.createProgram([${JSON.stringify(entryFile)}], {
  types: ['bun-types'], noEmit: true, skipLibCheck: true,
});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  throw new Error(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\\n')).join('\\n'));
}`,
        ],
        { cwd: rootDir, stdout: 'pipe', stderr: 'pipe' }
      );
      expect(result.stderr.toString()).toBe('');
      expect(result.exitCode).toBe(0);
    } finally {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  test('missing module resolver falls through when TypeScript is unavailable or throws', () => {
    const parentFile = path.join(os.tmpdir(), 'entry.ts');
    let loads = 0;
    const unavailable = createMissingModuleResolver(() => null);
    const throwing = createMissingModuleResolver(() => {
      loads++;
      throw new Error('typescript failed to load');
    });

    expect(unavailable('#runtime', parentFile)).toBeUndefined();
    expect(throwing('#runtime', parentFile)).toBeUndefined();
    expect(throwing('#runtime', parentFile)).toBeUndefined();
    expect(loads).toBe(1);
  });
});
