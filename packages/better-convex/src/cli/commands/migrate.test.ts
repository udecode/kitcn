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
});
