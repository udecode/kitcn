import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ANSI_ESCAPE_RE,
  createDefaultConfig,
  writeMinimalSchema,
  writePackageJson,
  writeShadcnNextApp,
} from '../test-utils';
import { ADD_HELP_TEXT, handleAddCommand, parseAddCommandArgs } from './add';

describe('cli/commands/add', () => {
  test('parseAddCommandArgs supports dry-run, diff, view, overwrite, no-codegen, only, and preset', () => {
    expect(
      parseAddCommandArgs([
        'resend',
        '--yes',
        '--json',
        '--diff',
        'convex/plugins/resend.ts',
        '--view=convex/schema.ts',
        '--overwrite',
        '--no-codegen',
        '--only',
        'schema',
        '--preset',
        'default',
      ])
    ).toEqual({
      plugin: 'resend',
      yes: true,
      json: true,
      dryRun: true,
      overwrite: true,
      noCodegen: true,
      only: 'schema',
      preset: 'default',
      diff: 'convex/plugins/resend.ts',
      view: 'convex/schema.ts',
    });
  });

  test('handleAddCommand(--help) prints add help and exits without writes', async () => {
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
      const exitCode = await handleAddCommand(['add', '--help'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(execaStub).not.toHaveBeenCalled();
      expect(infoLines.join('\n')).toContain(ADD_HELP_TEXT);
    } finally {
      console.info = originalInfo;
    }
  });

  test('handleAddCommand renders ANSI-colored dry-run output directly from the command module', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-add-command-dry-run-')
    );
    writePackageJson(tmpDir);
    writeMinimalSchema(tmpDir);

    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const infoLines: string[] = [];
    const originalInfo = console.info;
    const originalCwd = process.cwd();
    const originalForceColor = process.env.FORCE_COLOR;
    process.chdir(tmpDir);
    process.env.FORCE_COLOR = '1';
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    try {
      const exitCode = await handleAddCommand(
        ['add', 'resend', '--yes', '--dry-run'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
      expect(infoLines.join('\n')).toMatch(ANSI_ESCAPE_RE);
      expect(infoLines.join('\n')).toContain('better-convex add resend');
    } finally {
      process.chdir(originalCwd);
      process.env.FORCE_COLOR = originalForceColor;
      console.info = originalInfo;
    }
  });

  test('handleAddCommand reuses a running local convex backend for auth live bootstrap', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-add-auth-live-bootstrap-reuse-')
    );
    const originalCwd = process.cwd();
    process.chdir(dir);

    writeShadcnNextApp(dir);
    fs.mkdirSync(path.join(dir, 'convex', 'functions'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'convex', 'functions', 'schema.ts'),
      'import { defineSchema } from "better-convex/orm";\n\nexport default defineSchema({});\n'
    );

    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
    );
    const syncEnvStub = mock(async () => {});
    const runLocalBootstrapStub = mock(async () => 0);
    const generateMetaStub = mock(async (sharedDir: string) => {
      const generatedAuthPath = path.join(
        dir,
        sharedDir,
        '..',
        'functions',
        'generated',
        'auth.ts'
      );
      fs.mkdirSync(path.dirname(generatedAuthPath), { recursive: true });
      fs.writeFileSync(generatedAuthPath, 'export {};\n');
    });

    try {
      const exitCode = await handleAddCommand(['add', 'auth', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        loadBetterConvexConfig: (() => createDefaultConfig()) as any,
        runLocalBootstrap: runLocalBootstrapStub as any,
        syncEnv: syncEnvStub as any,
      } as any);

      expect(exitCode).toBe(0);
      expect(syncEnvStub).toHaveBeenCalledWith({
        authSyncMode: 'auto',
        force: true,
        sharedDir: 'convex/shared',
        targetArgs: [],
      });
      expect(runLocalBootstrapStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleAddCommand falls back to local bootstrap when auth live bootstrap probe fails', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-add-auth-live-bootstrap-fallback-')
    );
    const originalCwd = process.cwd();
    process.chdir(dir);

    writeShadcnNextApp(dir);
    fs.mkdirSync(path.join(dir, 'convex', 'functions'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'convex', 'functions', 'schema.ts'),
      'import { defineSchema } from "better-convex/orm";\n\nexport default defineSchema({});\n'
    );

    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
    );
    const syncEnvModes: string[] = [];
    const syncEnvStub = mock(async (params: { authSyncMode?: string }) => {
      syncEnvModes.push(params.authSyncMode ?? 'auto');
      throw new Error('local backend unavailable');
    });
    const runLocalBootstrapStub = mock(async () => 0);
    const generateMetaStub = mock(async (sharedDir: string) => {
      const generatedAuthPath = path.join(
        dir,
        sharedDir,
        '..',
        'functions',
        'generated',
        'auth.ts'
      );
      fs.mkdirSync(path.dirname(generatedAuthPath), { recursive: true });
      fs.writeFileSync(generatedAuthPath, 'export {};\n');
    });

    try {
      const exitCode = await handleAddCommand(['add', 'auth', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        loadBetterConvexConfig: (() => createDefaultConfig()) as any,
        runLocalBootstrap: runLocalBootstrapStub as any,
        syncEnv: syncEnvStub as any,
      } as any);

      expect(exitCode).toBe(0);
      expect(syncEnvModes).toEqual(['prepare', 'complete', 'auto']);
      expect(runLocalBootstrapStub).toHaveBeenCalledWith(
        expect.objectContaining({
          authSyncMode: 'auto',
          debug: false,
          sharedDir: 'convex/shared',
          targetArgs: [],
        })
      );
    } finally {
      process.chdir(originalCwd);
    }
  });
});
