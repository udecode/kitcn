import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BetterConvexConfig } from './config';
import { loadBetterConvexConfig } from './config';

const CONCAVE_CONFIG_FILE = 'concave.json';

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'better-convex-config-'));
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function writeBetterConvexConfig(dir: string, config: Record<string, unknown>) {
  writeFile(
    path.join(dir, CONCAVE_CONFIG_FILE),
    JSON.stringify(
      {
        meta: {
          'better-convex': config,
        },
      },
      null,
      2
    )
  );
}

function writeConcaveConfig(dir: string, config: Record<string, unknown>) {
  writeFile(
    path.join(dir, CONCAVE_CONFIG_FILE),
    JSON.stringify(config, null, 2)
  );
}

const DEFAULT_CONFIG: BetterConvexConfig = {
  backend: 'convex',
  paths: {
    lib: 'convex/lib',
    shared: 'convex/shared',
  },
  hooks: {
    postAdd: [],
  },
  dev: {
    debug: false,
    args: [],
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
    args: [],
    trimSegments: ['plugins'],
  },
  deploy: {
    args: [],
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
};

describe('cli/config', () => {
  test('loads concave.json meta["better-convex"] and ignores better-convex.config.ts', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      paths: {
        shared: 'convex/from-json',
      },
    });
    writeFile(
      path.join(dir, 'better-convex.config.ts'),
      `
      export default {
        paths: {
          shared: 'convex/from-ts',
        },
      };
      `.trim()
    );

    process.chdir(dir);
    try {
      expect(loadBetterConvexConfig().paths.shared).toBe('convex/from-json');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('returns defaults when concave.json is missing', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      expect(loadBetterConvexConfig()).toEqual(DEFAULT_CONFIG);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('returns defaults when concave.json exists without meta["better-convex"]', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeConcaveConfig(dir, {
      meta: {
        otherTool: {
          enabled: true,
        },
      },
      deploy: {
        target: 'cloudflare',
      },
    });

    process.chdir(dir);
    try {
      expect(loadBetterConvexConfig()).toEqual(DEFAULT_CONFIG);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws when legacy better-convex.json exists without concave.json', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeFile(
      path.join(dir, 'better-convex.json'),
      JSON.stringify({
        paths: {
          shared: 'convex/legacy-shared',
        },
      })
    );

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow(
        'Legacy config file better-convex.json is no longer supported'
      );
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

  test('throws for explicit better-convex.config.ts path', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeFile(
      path.join(dir, 'better-convex.config.ts'),
      `
      export default {
        paths: {
          shared: 'convex/from-ts',
        },
      };
      `.trim()
    );

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig('./better-convex.config.ts')).toThrow(
        'Only JSON config files are supported'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws when explicit config file has no meta["better-convex"] object', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeFile(
      path.join(dir, 'custom.json'),
      JSON.stringify({
        meta: {
          somethingElse: {
            foo: 'bar',
          },
        },
      })
    );

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig('./custom.json')).toThrow(
        'Missing meta["better-convex"]'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('loads and normalizes config values', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      backend: 'concave',
      paths: {
        shared: 'convex/custom-shared',
      },
      dev: {
        debug: true,
        args: ['--team', 'dev-team'],
        preRun: 'init',
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
        args: ['--prod'],
        scope: 'auth',
        trimSegments: ['plugins', 'internal'],
      },
      deploy: {
        args: ['--prod'],
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
    });

    process.chdir(dir);
    try {
      expect(loadBetterConvexConfig()).toEqual({
        backend: 'concave',
        paths: {
          lib: 'convex/lib',
          shared: 'convex/custom-shared',
        },
        hooks: {
          postAdd: [],
        },
        dev: {
          debug: true,
          args: ['--team', 'dev-team'],
          preRun: 'init',
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
          args: ['--prod'],
          scope: 'auth',
          trimSegments: ['plugins', 'internal'],
        },
        deploy: {
          args: ['--prod'],
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

  test('loads dev.preRun from config', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      dev: {
        preRun: 'init',
      },
    });

    process.chdir(dir);
    try {
      expect(loadBetterConvexConfig().dev.preRun).toBe('init');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('loads backend override from config', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      backend: 'concave',
    });

    process.chdir(dir);
    try {
      expect(loadBetterConvexConfig().backend).toBe('concave');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for invalid config values', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      codegen: {
        scope: 'bad',
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow(
        'Invalid codegen.scope in'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for invalid codegen.trimSegments values', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      codegen: {
        trimSegments: ['plugins/resend'],
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow(
        'Invalid codegen.trimSegments in'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for invalid dev.preRun values', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      dev: {
        preRun: '',
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow('Invalid dev.preRun in');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for invalid backend values', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      backend: 'nope',
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow(
        'Invalid meta["better-convex"].backend in'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for invalid aggregate backfill values', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      deploy: {
        aggregateBackfill: {
          enabled: 'bad',
        },
      },
    });

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

    writeBetterConvexConfig(dir, {
      dev: {
        migrations: {
          allowDrift: 'yes',
        },
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow(
        'Invalid dev.migrations.allowDrift in'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws when plugins config is provided', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      plugins: {
        resend: true,
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow('Unknown config key');
      expect(() => loadBetterConvexConfig()).toThrow(
        'meta["better-convex"].plugins'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('loads hooks.postAdd from config', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      hooks: {
        postAdd: ['bun lint:fix'],
      },
    });

    process.chdir(dir);
    try {
      expect(loadBetterConvexConfig().hooks).toEqual({
        postAdd: ['bun lint:fix'],
      });
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('accepts empty hooks.postAdd array', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      hooks: {
        postAdd: [],
      },
    });

    process.chdir(dir);
    try {
      expect(loadBetterConvexConfig().hooks).toEqual({
        postAdd: [],
      });
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for invalid hooks.postAdd value', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      hooks: {
        postAdd: 'bun lint:fix',
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow(
        'Invalid hooks.postAdd in'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('loads top-level paths config', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      paths: {
        lib: 'lib-custom',
        shared: 'shared-custom',
        env: 'convex/lib/get-env',
      },
    });

    process.chdir(dir);
    try {
      expect(loadBetterConvexConfig().paths).toEqual({
        lib: 'lib-custom',
        shared: 'shared-custom',
        env: 'convex/lib/get-env',
      });
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for invalid paths.lib path', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      paths: {
        lib: '../escape',
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow('Invalid paths.lib in');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for invalid paths.shared path', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      paths: {
        shared: '/abs/path',
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow('Invalid paths.shared in');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for invalid paths.env path', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      paths: {
        env: '/abs/path',
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow('Invalid paths.env in');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws when removed top-level outputDir is provided', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      outputDir: 'convex/shared',
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow('Unknown config key');
      expect(() => loadBetterConvexConfig()).toThrow('outputDir');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws when removed api/auth keys are provided', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      api: false,
      auth: true,
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow('Unknown config key');
      expect(() => loadBetterConvexConfig()).toThrow(
        'meta["better-convex"].api'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws for unknown nested keys', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      paths: {
        lib: 'lib',
        shared: 'convex/shared',
        extra: 'nope',
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow('Unknown config key');
      expect(() => loadBetterConvexConfig()).toThrow('paths.extra');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws when removed plugins key is provided', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      plugins: {
        anything: true,
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow('Unknown config key');
      expect(() => loadBetterConvexConfig()).toThrow(
        'meta["better-convex"].plugins'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws when removed plugins.lockfilePath is provided', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      plugins: {
        lockfilePath: 'convex/plugins.lock.json',
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow('Unknown config key');
      expect(() => loadBetterConvexConfig()).toThrow(
        'meta["better-convex"].plugins'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('throws when removed plugins.profiles is provided', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeBetterConvexConfig(dir, {
      plugins: {
        profiles: {
          resend: 'default',
        },
      },
    });

    process.chdir(dir);
    try {
      expect(() => loadBetterConvexConfig()).toThrow('Unknown config key');
      expect(() => loadBetterConvexConfig()).toThrow(
        'meta["better-convex"].plugins'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });
});
