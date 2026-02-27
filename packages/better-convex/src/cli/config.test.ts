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
          aggregateBackfill: {
            enabled: 'auto',
            wait: true,
            batchSize: 1000,
            pollIntervalMs: 1000,
            timeoutMs: 900_000,
            strict: false,
          },
          migrations: {
            enabled: 'auto',
            wait: true,
            batchSize: 256,
            pollIntervalMs: 1000,
            timeoutMs: 900_000,
            strict: false,
            allowDrift: true,
          },
        },
        codegen: {
          debug: false,
          convexArgs: [],
        },
        deploy: {
          convexArgs: [],
          aggregateBackfill: {
            enabled: 'auto',
            wait: true,
            batchSize: 1000,
            pollIntervalMs: 1000,
            timeoutMs: 900_000,
            strict: true,
          },
          migrations: {
            enabled: 'auto',
            wait: true,
            batchSize: 256,
            pollIntervalMs: 1000,
            timeoutMs: 900_000,
            strict: true,
            allowDrift: false,
          },
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
            aggregateBackfill: {
              enabled: 'on',
              wait: false,
              batchSize: 250,
            },
            migrations: {
              enabled: 'on',
              wait: false,
              batchSize: 32,
              pollIntervalMs: 250,
              timeoutMs: 30_000,
              strict: true,
              allowDrift: false,
            },
          },
          codegen: {
            debug: true,
            convexArgs: ['--prod'],
            scope: 'auth',
          },
          deploy: {
            convexArgs: ['--prod'],
            aggregateBackfill: {
              enabled: 'auto',
              wait: true,
              batchSize: 500,
              pollIntervalMs: 750,
              timeoutMs: 120_000,
              strict: false,
            },
            migrations: {
              enabled: 'off',
              allowDrift: true,
            },
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
          aggregateBackfill: {
            enabled: 'on',
            wait: false,
            batchSize: 250,
            pollIntervalMs: 1000,
            timeoutMs: 900_000,
            strict: false,
          },
          migrations: {
            enabled: 'on',
            wait: false,
            batchSize: 32,
            pollIntervalMs: 250,
            timeoutMs: 30_000,
            strict: true,
            allowDrift: false,
          },
        },
        codegen: {
          debug: true,
          convexArgs: ['--prod'],
          scope: 'auth',
        },
        deploy: {
          convexArgs: ['--prod'],
          aggregateBackfill: {
            enabled: 'auto',
            wait: true,
            batchSize: 500,
            pollIntervalMs: 750,
            timeoutMs: 120_000,
            strict: false,
          },
          migrations: {
            enabled: 'off',
            wait: true,
            batchSize: 256,
            pollIntervalMs: 1000,
            timeoutMs: 900_000,
            strict: true,
            allowDrift: true,
          },
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

  test('throws for invalid aggregate backfill values', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeFile(
      path.join(dir, 'better-convex.json'),
      JSON.stringify({
        deploy: {
          aggregateBackfill: {
            enabled: 'bad',
          },
        },
      })
    );

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow(
        'Invalid deploy.aggregateBackfill.enabled in'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for invalid migrations values', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeFile(
      path.join(dir, 'better-convex.json'),
      JSON.stringify({
        dev: {
          migrations: {
            allowDrift: 'yes',
          },
        },
      })
    );

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow(
        'Invalid dev.migrations.allowDrift in'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });
});
