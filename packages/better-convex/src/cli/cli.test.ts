import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureConvexGitignoreEntry,
  getAggregateBackfillDeploymentKey,
  getDevAggregateBackfillStatePath,
  isEntryPoint,
  parseArgs,
  run,
} from './cli';

const TS_EXTENSION_RE = /\.ts$/;

function createDefaultConfig() {
  return {
    api: true,
    auth: true,
    outputDir: 'convex/shared',
    dev: {
      debug: false,
      convexArgs: [],
      aggregateBackfill: {
        enabled: 'auto' as const,
        wait: true,
        batchSize: 1000,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: false,
      },
      migrations: {
        enabled: 'auto' as const,
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
        enabled: 'auto' as const,
        wait: true,
        batchSize: 1000,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: true,
      },
      migrations: {
        enabled: 'auto' as const,
        wait: true,
        batchSize: 256,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: true,
        allowDrift: false,
      },
    },
  };
}

describe('cli/cli', () => {
  test('isEntryPoint treats symlinked bin shims as the entrypoint', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-entrypoint-')
    );
    const target = path.join(tmpDir, 'target.mjs');
    const link = path.join(tmpDir, 'link');

    fs.writeFileSync(target, 'export {};');
    fs.symlinkSync(target, link);

    expect(isEntryPoint(link, target)).toBe(true);
    expect(isEntryPoint(target, target)).toBe(true);

    const other = path.join(tmpDir, 'other.mjs');
    fs.writeFileSync(other, 'export {};');
    expect(isEntryPoint(link, other)).toBe(false);
  });

  test('parseArgs defaults to dev and strips better-convex flags anywhere', () => {
    expect(parseArgs([])).toEqual({
      command: 'dev',
      restArgs: [],
      convexArgs: [],
      debug: false,
      outputDir: undefined,
      scope: undefined,
      configPath: undefined,
    });

    expect(
      parseArgs([
        '--debug',
        '--api',
        'out/dir',
        '--scope',
        'auth',
        '--config',
        './better-convex.config.json',
      ])
    ).toEqual({
      command: 'dev',
      restArgs: [],
      convexArgs: [],
      debug: true,
      outputDir: 'out/dir',
      scope: 'auth',
      configPath: './better-convex.config.json',
    });

    expect(
      parseArgs([
        '--debug',
        '--api',
        'out',
        'codegen',
        '--scope',
        'orm',
        '--foo',
        'bar',
      ])
    ).toEqual({
      command: 'codegen',
      restArgs: ['--foo', 'bar'],
      convexArgs: ['--foo', 'bar'],
      debug: true,
      outputDir: 'out',
      scope: 'orm',
      configPath: undefined,
    });
  });

  test('parseArgs throws for invalid --scope value', () => {
    expect(() => parseArgs(['--scope', 'bad'])).toThrow(
      'Invalid --scope value "bad". Expected one of: all, auth, orm.'
    );
  });

  test('parseArgs throws for missing --config value', () => {
    expect(() => parseArgs(['--config'])).toThrow(
      'Missing value for --config.'
    );
  });

  test('ensureConvexGitignoreEntry adds .convex/ once', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-gitignore-')
    );
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const gitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules\n');

    ensureConvexGitignoreEntry(tmpDir);
    ensureConvexGitignoreEntry(tmpDir);

    const updated = fs.readFileSync(gitignorePath, 'utf8');
    expect(updated).toContain('.convex/\n');
    expect((updated.match(/\.convex\/\n/g) ?? []).length).toBe(1);
  });

  test('ensureConvexGitignoreEntry updates repo root .gitignore when run from nested cwd', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-gitignore-nested-')
    );
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const nestedDir = path.join(tmpDir, 'example', 'convex', 'functions');
    fs.mkdirSync(nestedDir, { recursive: true });

    const rootGitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(rootGitignorePath, 'node_modules\n');

    ensureConvexGitignoreEntry(nestedDir);

    const updated = fs.readFileSync(rootGitignorePath, 'utf8');
    expect(updated).toContain('.convex/\n');
  });

  test('getAggregateBackfillDeploymentKey resolves prod/deployment/preview/local', () => {
    expect(getAggregateBackfillDeploymentKey(['--prod'])).toBe('prod');
    expect(
      getAggregateBackfillDeploymentKey(['--deployment-name', 'staging-one'])
    ).toBe('deployment:staging-one');
    expect(
      getAggregateBackfillDeploymentKey(['--preview-name=feature-123'])
    ).toBe('preview:feature-123');
    expect(getAggregateBackfillDeploymentKey([])).toBe('local');
  });

  test('getDevAggregateBackfillStatePath lives under .convex', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-state-')
    );
    expect(getDevAggregateBackfillStatePath(tmpDir)).toBe(
      path.join(
        tmpDir,
        '.convex',
        'better-convex',
        'aggregate-backfill-state.json'
      )
    );
  });

  test('run(codegen) calls generateMeta first and then invokes convex codegen with merged args', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      outputDir: 'config/out',
      codegen: {
        debug: false,
        convexArgs: ['--team', 'acme'],
        scope: 'orm' as const,
      },
    }));

    const exitCode = await run(
      [
        '--debug',
        '--api',
        'custom/out',
        '--scope',
        'auth',
        '--config',
        './custom-config.json',
        'codegen',
        '--prod',
      ],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(loadConfigStub).toHaveBeenCalledWith('./custom-config.json');
    expect(generateMetaStub).toHaveBeenCalledWith('custom/out', {
      debug: true,
      scope: 'auth',
    });
    expect(calls).toEqual([
      {
        cmd: 'node',
        args: ['/fake/convex/main.js', 'codegen', '--team', 'acme', '--prod'],
      },
    ]);
  });

  test('run(codegen) derives scope from api/auth config when scope is missing', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      api: false,
      auth: false,
    }));

    const exitCode = await run(['codegen'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(generateMetaStub).toHaveBeenCalledWith('convex/shared', {
      debug: false,
      scope: 'orm',
    });
  });

  test('run(codegen) uses direct api/auth toggles for api-only mode', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      auth: false,
    }));

    const exitCode = await run(['codegen'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(generateMetaStub).toHaveBeenCalledWith('convex/shared', {
      debug: false,
      api: true,
      auth: false,
    });
  });

  test('run(env sync) delegates to syncEnv and does not call convex', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['env', 'sync', '--auth', '--force', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(syncEnvStub).toHaveBeenCalledWith({
      auth: true,
      force: true,
      prod: true,
    });
    expect(execaStub).not.toHaveBeenCalled();
    expect(loadConfigStub).not.toHaveBeenCalled();
  });

  test('run(env get) passes through to convex env with filtered args and preserves exitCode', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 7 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(
      ['--debug', 'env', 'get', 'FOO', '--api', 'ignored'],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(7);
    expect(calls).toEqual([
      { cmd: 'node', args: ['/fake/convex/main.js', 'env', 'get', 'FOO'] },
    ]);
    expect(loadConfigStub).not.toHaveBeenCalled();
  });

  test('run(analyze) delegates to internal analyzer and does not invoke convex CLI', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const runAnalyzeStub = mock(async () => 5);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['analyze', '--details'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      runAnalyze: runAnalyzeStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(5);
    expect(runAnalyzeStub).toHaveBeenCalledWith(['--details']);
    expect(execaStub).not.toHaveBeenCalled();
    expect(loadConfigStub).not.toHaveBeenCalled();
  });

  test('run(deploy) executes post-deploy aggregate backfill with wait', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args[1] === 'run' && args.includes('generated/server:migrationRun')) {
        return {
          exitCode: 0,
          stdout: '{"status":"running","runId":"mr_1"}\n',
          stderr: '',
        } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:migrationStatus')
      ) {
        return {
          exitCode: 0,
          stdout:
            '{"status":"idle","runs":[{"status":"completed","currentIndex":1,"migrationIds":["m1"]}]}\n',
          stderr: '',
        } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfillStatus')
      ) {
        return { exitCode: 0, stdout: '[]\n', stderr: '' } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return { exitCode: 0, stdout: '{"status":"ok"}\n', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(
      ['deploy', '--debug', '--api', 'out', '--prod'],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(loadConfigStub).toHaveBeenCalledWith(undefined);
    expect(calls[0]).toEqual({
      cmd: 'node',
      args: ['/fake/convex/main.js', 'deploy', '--prod'],
    });
    expect(calls[1]?.args).toContain('generated/server:migrationRun');
    expect(calls[2]?.args).toContain('generated/server:migrationStatus');
    expect(calls[3]?.args).toContain('generated/server:aggregateBackfill');
    expect(calls[4]?.args).toContain(
      'generated/server:aggregateBackfillStatus'
    );
  });

  test('run(deploy) skips backfill commands when --backfill=off is passed', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(
      ['deploy', '--backfill=off', '--migrations=off', '--prod'],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      { cmd: 'node', args: ['/fake/convex/main.js', 'deploy', '--prod'] },
    ]);
  });

  test('run(migrate up) executes migration runtime with polling', async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes('generated/server:migrationRun')) {
        return {
          exitCode: 0,
          stdout: '{"status":"running","runId":"mr_2"}\n',
          stderr: '',
        } as any;
      }
      if (args.includes('generated/server:migrationStatus')) {
        return {
          exitCode: 0,
          stdout:
            '{"status":"idle","runs":[{"status":"completed","currentIndex":1,"migrationIds":["m1"]}]}\n',
          stderr: '',
        } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['migrate', 'up', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(calls[0]?.args).toContain('generated/server:migrationRun');
    expect(calls[1]?.args).toContain('generated/server:migrationStatus');
  });

  test('run(migrate up) prints explicit noop message when nothing is pending', async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes('generated/server:migrationRun')) {
        return {
          exitCode: 0,
          stdout: '{"status":"noop"}\n',
          stderr: '',
        } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const infoMessages: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoMessages.push(args.join(' '));
    };

    try {
      const exitCode = await run(['migrate', 'up', '--prod'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expect(calls.length).toBe(1);
      expect(calls[0]?.args).toContain('generated/server:migrationRun');
      expect(
        infoMessages.some((line) => line.includes('No pending migrations'))
      ).toBe(true);
    } finally {
      console.info = originalInfo;
    }
  });

  test('run(migrate create) scaffolds a migration file and manifest', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-migration-create-')
    );
    const functionsDir = path.join(tmpDir, 'convex');
    fs.mkdirSync(functionsDir, { recursive: true });

    const oldCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const getConvexConfigStub = mock(() => ({
        functionsDir,
        outputFile: path.join(functionsDir, 'shared', 'api.ts'),
      }));

      const exitCode = await run(['migrate', 'create', 'Add user field'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        getConvexConfig: getConvexConfigStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      const migrationsDir = path.join(functionsDir, 'migrations');
      const migrationFiles = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.ts') && file !== 'manifest.ts');
      expect(migrationFiles.length).toBe(1);
      const migrationSource = fs.readFileSync(
        path.join(migrationsDir, migrationFiles[0]!),
        'utf8'
      );
      const manifestSource = fs.readFileSync(
        path.join(migrationsDir, 'manifest.ts'),
        'utf8'
      );
      expect(migrationSource).toContain('defineMigration');
      expect(migrationSource).toContain(
        "import { defineMigration } from '../generated/migrations.gen';"
      );
      expect(manifestSource).toContain('defineMigrationSet');
      expect(manifestSource).toContain(
        "import { defineMigrationSet } from 'better-convex/orm';"
      );
      expect(manifestSource).toContain(
        migrationFiles[0]!.replace(TS_EXTENSION_RE, '')
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(deploy) rejects removed --backfill-mode flag', async () => {
    const execaStub = mock(
      async (_cmd: string, _args: string[]) => ({ exitCode: 0 }) as any
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['deploy', '--backfill-mode=rebuild'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      '`--backfill-mode` was removed. Use `better-convex aggregate rebuild`.'
    );
  });

  test('run(deploy) fails in strict resume mode when kickoff reports needsRebuild', async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return {
          exitCode: 0,
          stdout: '{"status":"ok","needsRebuild":1}\n',
          stderr: '',
        } as any;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['deploy'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(1);
    expect(calls.length).toBe(3);
    expect(calls[0]?.args[1]).toBe('deploy');
    expect(calls[1]?.args).toContain('generated/server:migrationRun');
    expect(calls[2]?.args).toContain('generated/server:aggregateBackfill');
  });

  test('run(dev) rejects --scope and instructs using codegen --scope', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['--scope', 'orm'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      '`--scope` is not supported for `better-convex dev`. Use `better-convex codegen --scope <all|auth|orm>` for scoped generation.'
    );

    expect(generateMetaStub).not.toHaveBeenCalled();
    expect(execaStub).not.toHaveBeenCalled();
  });

  test('run(dev) rejects removed --backfill-mode flag', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['dev', '--backfill-mode=rebuild'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      '`--backfill-mode` was removed. Use `better-convex aggregate rebuild`.'
    );

    expect(generateMetaStub).not.toHaveBeenCalled();
    expect(execaStub).not.toHaveBeenCalled();
  });

  test('run(aggregate rebuild) executes rebuild backfill and status polling', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfillStatus')
      ) {
        return { exitCode: 0, stdout: '[]\n', stderr: '' } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return { exitCode: 0, stdout: '{"status":"ok"}\n', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['aggregate', 'rebuild', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(calls[0]?.args).toContain('generated/server:aggregateBackfill');
    expect(calls[0]?.args[calls[0].args.length - 1]).toContain(
      '"mode":"rebuild"'
    );
    expect(calls[1]?.args).toContain(
      'generated/server:aggregateBackfillStatus'
    );
  });

  test('run(aggregate backfill) executes resume backfill and status polling', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfillStatus')
      ) {
        return { exitCode: 0, stdout: '[]\n', stderr: '' } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return { exitCode: 0, stdout: '{"status":"ok"}\n', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['aggregate', 'backfill', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(calls[0]?.args).toContain('generated/server:aggregateBackfill');
    expect(calls[0]?.args[calls[0].args.length - 1]).toContain(
      '"mode":"resume"'
    );
    expect(calls[1]?.args).toContain(
      'generated/server:aggregateBackfillStatus'
    );
  });

  test('run(aggregate prune) executes prune without status polling', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return {
          exitCode: 0,
          stdout: '{"status":"ok","pruned":2}\n',
          stderr: '',
        } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['aggregate', 'prune', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toContain('generated/server:aggregateBackfill');
    expect(calls[0]?.args[calls[0].args.length - 1]).toContain(
      '"mode":"prune"'
    );
  });

  test('run(reset) requires --yes confirmation', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['reset'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      '`better-convex reset` is destructive. Re-run with `--yes`.'
    );
  });

  test('run(reset) rejects backfill flags', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['reset', '--yes', '--backfill=off'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      '`better-convex reset` does not accept backfill flags. It always runs aggregateBackfill in resume mode.'
    );
  });

  test('run(reset) executes before hook, reset, resume backfill, status, then after hook', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfillStatus')
      ) {
        return { exitCode: 0, stdout: '[]\n', stderr: '' } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return { exitCode: 0, stdout: '{"status":"ok"}\n', stderr: '' } as any;
      }
      if (args[1] === 'run') {
        return { exitCode: 0, stdout: '{"status":"ok"}\n', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(
      [
        'reset',
        '--yes',
        '--before',
        'internal.app.resetHooks:before',
        '--after=internal.app.resetHooks:after',
        '--prod',
      ],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(0);
    const runCalls = calls.filter((entry) => entry.args[1] === 'run');
    const runFunctions = runCalls.map((entry) => entry.args.at(-2));
    expect(runFunctions).toEqual([
      'internal.app.resetHooks:before',
      'generated/server:reset',
      'generated/server:aggregateBackfill',
      'generated/server:aggregateBackfillStatus',
      'internal.app.resetHooks:after',
    ]);
    expect(runCalls[1]?.args[runCalls[1].args.length - 1]).toBe('{}');
    expect(runCalls[2]?.args[runCalls[2].args.length - 1]).toContain(
      '"mode":"resume"'
    );
  });

  test('run(dev) runs aggregateBackfill and waits via status polling by default', async () => {
    const calls: { cmd: string; args: string[]; opts?: any }[] = [];
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);

    try {
      const watcherProcess: any = new Promise(() => {});
      watcherProcess.killed = false;
      watcherProcess.kill = mock((signal?: string) => {
        watcherProcess.killed = true;
        watcherProcess.lastSignal = signal;
      });

      const convexProcess: any = Promise.resolve({ exitCode: 0 });
      convexProcess.killed = false;
      convexProcess.kill = mock((signal?: string) => {
        convexProcess.killed = true;
        convexProcess.lastSignal = signal;
      });

      const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
        calls.push({ cmd, args, opts });
        if (cmd === 'bun') return watcherProcess;
        if (
          args[1] === 'run' &&
          args.includes('generated/server:aggregateBackfillStatus')
        ) {
          return Promise.resolve({ exitCode: 0, stdout: '[]\n', stderr: '' });
        }
        if (
          args[1] === 'run' &&
          args.includes('generated/server:aggregateBackfill')
        ) {
          return Promise.resolve({
            exitCode: 0,
            stdout: '{"status":"ok"}\n',
            stderr: '',
          });
        }
        return convexProcess;
      });

      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expect(
        calls.some(
          ({ args }) =>
            args[1] === 'run' &&
            args.includes('generated/server:aggregateBackfill')
        )
      ).toBe(true);
      expect(
        calls.some(
          ({ args }) =>
            args[1] === 'run' &&
            args.includes('generated/server:aggregateBackfillStatus')
        )
      ).toBe(true);
    } finally {
      onSpy.mockRestore();
    }
  });

  test('run(dev) uses config toggles and merged convex args', async () => {
    const calls: { cmd: string; args: string[]; opts?: any }[] = [];

    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    try {
      const watcherProcess: any = new Promise(() => {});
      watcherProcess.killed = false;
      watcherProcess.kill = mock((signal?: string) => {
        watcherProcess.killed = true;
        watcherProcess.lastSignal = signal;
      });

      const convexProcess: any = Promise.resolve({ exitCode: 9 });
      convexProcess.killed = false;
      convexProcess.kill = mock((signal?: string) => {
        convexProcess.killed = true;
        convexProcess.lastSignal = signal;
      });

      const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
        calls.push({ cmd, args, opts });
        if (cmd === 'bun') return watcherProcess;
        return convexProcess;
      });
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => ({
        ...createDefaultConfig(),
        api: false,
        auth: true,
        dev: {
          debug: false,
          convexArgs: ['--team', 'cfg-team'],
          aggregateBackfill: {
            ...createDefaultConfig().dev.aggregateBackfill,
            enabled: 'off' as const,
          },
          migrations: {
            ...createDefaultConfig().dev.migrations,
            enabled: 'off' as const,
          },
        },
      }));

      const exitCode = await run(['--debug', '--api', 'out', 'dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(9);
      expect(generateMetaStub).toHaveBeenCalledWith('out', {
        debug: true,
        api: false,
        auth: true,
      });

      expect(calls.length).toBe(2);
      expect(calls[0].cmd).toBe('bun');
      expect(Array.isArray(calls[0].args)).toBe(true);
      expect((calls[0].args[0] as string).endsWith('/watcher.ts')).toBe(true);
      expect(calls[0].opts?.env?.BETTER_CONVEX_API_OUTPUT_DIR).toBe('out');
      expect(calls[0].opts?.env?.BETTER_CONVEX_DEBUG).toBe('1');
      expect(calls[0].opts?.env?.BETTER_CONVEX_GENERATE_API).toBe('0');
      expect(calls[0].opts?.env?.BETTER_CONVEX_GENERATE_AUTH).toBe('1');

      expect(calls[1]).toEqual({
        cmd: 'node',
        args: ['/fake/convex/main.js', 'dev', '--team', 'cfg-team', '--once'],
        opts: {
          stdio: 'inherit',
          cwd: process.cwd(),
          reject: false,
        },
      });

      expect(watcherProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(convexProcess.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      onSpy.mockRestore();
    }
  });
});
