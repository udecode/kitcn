import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBetterConvexConfig } from './config';

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'better-convex-config-'));
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

describe('cli/config', () => {
  test('returns defaults when better-convex.json is missing', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      expect(loadBetterConvexConfig()).toEqual({
        api: true,
        auth: true,
        outputDir: 'convex/shared',
        dev: {
          debug: false,
          convexArgs: [],
        },
        codegen: {
          debug: false,
          convexArgs: [],
        },
      });
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for missing explicit config path', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig('./does-not-exist.json')).toThrow(
        'Config file not found:'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('loads and normalizes config values', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeFile(
      path.join(dir, 'better-convex.json'),
      JSON.stringify(
        {
          api: false,
          auth: true,
          outputDir: 'convex/custom-shared',
          dev: {
            debug: true,
            convexArgs: ['--team', 'dev-team'],
          },
          codegen: {
            debug: true,
            convexArgs: ['--prod'],
            scope: 'auth',
          },
        },
        null,
        2
      )
    );

    process.chdir(dir);
    try {
      expect(loadBetterConvexConfig()).toEqual({
        api: false,
        auth: true,
        outputDir: 'convex/custom-shared',
        dev: {
          debug: true,
          convexArgs: ['--team', 'dev-team'],
        },
        codegen: {
          debug: true,
          convexArgs: ['--prod'],
          scope: 'auth',
        },
      });
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for invalid config values', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeFile(
      path.join(dir, 'better-convex.json'),
      JSON.stringify({
        codegen: {
          scope: 'bad',
        },
      })
    );

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow(
        'Invalid codegen.scope in'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });
});
