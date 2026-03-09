import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ANSI_ESCAPE_RE,
  createDefaultConfig,
  writeMinimalSchema,
  writePackageJson,
} from '../test-utils';
import { ADD_HELP_TEXT, handleAddCommand, parseAddCommandArgs } from './add';

describe('cli/commands/add', () => {
  test('parseAddCommandArgs supports dry-run, diff, view, overwrite, no-codegen, and preset', () => {
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
});
