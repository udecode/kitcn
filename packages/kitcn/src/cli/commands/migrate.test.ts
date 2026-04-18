import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDefaultConfig,
  writeMinimalSchema,
  writePackageJson,
} from '../test-utils';
import {
  handleMigrateCommand,
  MIGRATE_HELP_TEXT,
  parseMigrateCommandArgs,
} from './migrate';

describe('cli/commands/migrate', () => {
  const withConvexDeployKey = async (
    deployKey: string,
    run: () => Promise<void>
  ) => {
    const originalDeployKey = process.env.CONVEX_DEPLOY_KEY;
    process.env.CONVEX_DEPLOY_KEY = deployKey;

    try {
      await run();
    } finally {
      process.env.CONVEX_DEPLOY_KEY = originalDeployKey;
    }
  };

  test('parseMigrateCommandArgs parses create/list/up/down/status/cancel shapes', () => {
    expect(parseMigrateCommandArgs(['create', 'Add', 'field'])).toEqual({
      subcommand: 'create',
      restArgs: ['Add', 'field'],
      list: false,
      yes: false,
    });
    const listArgs = parseMigrateCommandArgs(['--list']);
    expect(listArgs.restArgs).toEqual([]);
    expect(listArgs.list).toBe(true);
    expect(listArgs.yes).toBe(false);
    expect(listArgs.subcommand).toBeUndefined();
  });

  test('handleMigrateCommand(--help) prints migrate help', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    try {
      const exitCode = await handleMigrateCommand(['migrate', '--help'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(infoLines.join('\n')).toContain(MIGRATE_HELP_TEXT);
    } finally {
      console.info = originalInfo;
    }
  });

  test('handleMigrateCommand(create) scaffolds a migration through the command module', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-migrate-command-create-')
    );
    writePackageJson(tmpDir);
    writeMinimalSchema(tmpDir);

    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const getConvexConfigStub = mock(() => ({
      functionsDir: path.join(tmpDir, 'convex'),
      sharedDir: path.join(tmpDir, 'convex', 'shared'),
    }));
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleMigrateCommand(
        ['migrate', 'create', 'Add user field'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
          getConvexConfig: getConvexConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
      const migrationsDir = path.join(tmpDir, 'convex', 'migrations');
      expect(fs.existsSync(migrationsDir)).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleMigrateCommand(up) uses concave run when backend is concave', async () => {
    const concaveCliPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-concave-cli-')),
      'main.mjs'
    );
    fs.writeFileSync(concaveCliPath, 'export {};\n');
    const calls: { cmd: string; args: string[] }[] = [];
    let callIndex = 0;
    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      callIndex += 1;
      if (callIndex === 1) {
        return {
          exitCode: 0,
          stdout: `${JSON.stringify({
            status: 'running',
            runId: 'mr_concave',
          })}\n`,
          stderr: '',
        } as any;
      }
      return {
        exitCode: 0,
        stdout: `${JSON.stringify({
          status: 'idle',
          runs: [
            {
              status: 'completed',
              currentIndex: 1,
              migrationIds: ['m1'],
            },
          ],
        })}\n`,
        stderr: '',
      } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      backend: 'concave' as const,
    }));

    const exitCode = await handleMigrateCommand(
      [
        '--backend',
        'concave',
        'migrate',
        'up',
        '--url',
        'http://localhost:3210',
      ],
      {
        realConvex: '/fake/convex/main.js',
        realConcave: concaveCliPath,
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      {
        cmd: 'bun',
        args: [
          concaveCliPath,
          'run',
          '--url',
          'http://localhost:3210',
          'generated/server:migrationRun',
          '{"direction":"up","batchSize":256,"allowDrift":false}',
        ],
      },
      {
        cmd: 'bun',
        args: [
          concaveCliPath,
          'run',
          '--url',
          'http://localhost:3210',
          'generated/server:migrationStatus',
          '{"runId":"mr_concave"}',
        ],
      },
    ]);
  });

  test('handleMigrateCommand(up) parses concave run output with a preamble and pretty JSON body', async () => {
    const concaveCliPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-concave-cli-')),
      'main.mjs'
    );
    fs.writeFileSync(concaveCliPath, 'export {};\n');
    const calls: { cmd: string; args: string[] }[] = [];
    let callIndex = 0;
    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      callIndex += 1;
      if (callIndex === 1) {
        return {
          exitCode: 0,
          stdout:
            '🚀 Running generated/server:migrationRun\n' +
            '   Args: {"direction":"up","batchSize":256,"allowDrift":false}\n' +
            '   URL: http://127.0.0.1:3210/api/execute\n\n' +
            '✓ Success\n\n' +
            '{\n' +
            '  "status": "running",\n' +
            '  "runId": "mr_concave"\n' +
            '}\n',
          stderr: '',
        } as any;
      }
      return {
        exitCode: 0,
        stdout:
          '🚀 Running generated/server:migrationStatus\n' +
          '   Args: {"runId":"mr_concave"}\n' +
          '   URL: http://127.0.0.1:3210/api/execute\n\n' +
          '✓ Success\n\n' +
          '{\n' +
          '  "status": "idle",\n' +
          '  "runs": [\n' +
          '    {\n' +
          '      "status": "completed",\n' +
          '      "currentIndex": 1,\n' +
          '      "migrationIds": ["m1"]\n' +
          '    }\n' +
          '  ]\n' +
          '}\n',
        stderr: '',
      } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      backend: 'concave' as const,
    }));

    const exitCode = await handleMigrateCommand(
      [
        '--backend',
        'concave',
        'migrate',
        'up',
        '--url',
        'http://localhost:3210',
      ],
      {
        realConvex: '/fake/convex/main.js',
        realConcave: concaveCliPath,
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.args).toContain('generated/server:migrationStatus');
  });

  test('handleMigrateCommand(up) forwards ambient Convex deployment env for convex backend', async () => {
    const calls: Array<{
      args: string[];
      env: Record<string, string | undefined>;
    }> = [];
    const execaStub = mock(
      async (_cmd: string, args: string[], options?: { env?: unknown }) => {
        calls.push({
          args,
          env: (options?.env ?? {}) as Record<string, string | undefined>,
        });
        return {
          exitCode: 0,
          stdout: `${JSON.stringify({ status: 'noop' })}\n`,
          stderr: '',
        } as any;
      }
    );
    const loadConfigStub = mock(() => {
      const config = createDefaultConfig();
      config.deploy.migrations.wait = false;
      return config;
    });

    await withConvexDeployKey('prod:demo|secret', async () => {
      const exitCode = await handleMigrateCommand(
        ['migrate', 'up', '--prod', '--yes'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          loadCliConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toContain('--prod');
    expect(calls[0]?.env).toEqual(
      expect.objectContaining({
        CONVEX_DEPLOY_KEY: 'prod:demo|secret',
      })
    );
  });

  test('handleMigrateCommand(status) forwards ambient Convex deployment env for convex backend', async () => {
    const calls: Record<string, string | undefined>[] = [];
    const execaStub = mock(
      async (
        _cmd: string,
        _args: string[],
        options?: { env?: Record<string, string | undefined> }
      ) => {
        calls.push(options?.env ?? {});
        return {
          exitCode: 0,
          stdout: '{}\n',
          stderr: '',
        } as any;
      }
    );
    const loadConfigStub = mock(() => createDefaultConfig());

    await withConvexDeployKey('prod:demo|secret', async () => {
      const exitCode = await handleMigrateCommand(
        ['migrate', 'status', '--prod'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          loadCliConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        CONVEX_DEPLOY_KEY: 'prod:demo|secret',
      })
    );
  });

  test('handleMigrateCommand(cancel) forwards ambient Convex deployment env for convex backend', async () => {
    const calls: Record<string, string | undefined>[] = [];
    const execaStub = mock(
      async (
        _cmd: string,
        _args: string[],
        options?: { env?: Record<string, string | undefined> }
      ) => {
        calls.push(options?.env ?? {});
        return {
          exitCode: 0,
          stdout: '{}\n',
          stderr: '',
        } as any;
      }
    );
    const loadConfigStub = mock(() => createDefaultConfig());

    await withConvexDeployKey('prod:demo|secret', async () => {
      const exitCode = await handleMigrateCommand(
        ['migrate', 'cancel', '--prod', '--run-id', 'mr_123'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          loadCliConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        CONVEX_DEPLOY_KEY: 'prod:demo|secret',
      })
    );
  });
});
