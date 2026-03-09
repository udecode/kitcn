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
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(infoLines.join('\n')).toContain(MIGRATE_HELP_TEXT);
    } finally {
      console.info = originalInfo;
    }
  });

  test('handleMigrateCommand(create) scaffolds a migration through the command module', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-migrate-command-create-')
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
          loadBetterConvexConfig: loadConfigStub as any,
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
      fs.mkdtempSync(path.join(os.tmpdir(), 'better-convex-concave-cli-')),
      'main.mjs'
    );
    fs.writeFileSync(concaveCliPath, 'export {};\n');
    const calls: { cmd: string; args: string[] }[] = [];
    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes('generated/server:migrationRun')) {
        return {
          exitCode: 0,
          stdout: '{"status":"running","runId":"mr_concave"}\n',
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
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(calls[0]).toEqual({
      cmd: 'bun',
      args: [
        concaveCliPath,
        'run',
        '--url',
        'http://localhost:3210',
        'generated/server:migrationRun',
        '{"direction":"up","batchSize":256,"allowDrift":false}',
      ],
    });
    expect(calls[1]?.cmd).toBe('bun');
    expect(calls[1]?.args).toContain('generated/server:migrationStatus');
    expect(calls[1]?.args).toContain('--url');
  });
});
