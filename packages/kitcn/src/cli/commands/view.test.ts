import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDefaultConfig,
  writeMinimalSchema,
  writePackageJson,
} from '../test-utils';
import {
  handleViewCommand,
  parseViewCommandArgs,
  VIEW_HELP_TEXT,
} from './view';

describe('cli/commands/view', () => {
  test('parseViewCommandArgs supports plugin, preset, and json', () => {
    expect(
      parseViewCommandArgs(['resend', '--preset', 'default', '--json'])
    ).toEqual({
      plugin: 'resend',
      json: true,
      preset: 'default',
    });
  });

  test('handleViewCommand(--help) prints view help', async () => {
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
      const exitCode = await handleViewCommand(['view', '--help'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(execaStub).not.toHaveBeenCalled();
      expect(infoLines.join('\n')).toContain(VIEW_HELP_TEXT);
    } finally {
      console.info = originalInfo;
    }
  });

  test('handleViewCommand(--json) returns command-local plan inspection output', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-view-command-json-')
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
    process.chdir(tmpDir);
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    try {
      const exitCode = await handleViewCommand(['view', 'resend', '--json'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      const payload = JSON.parse(infoLines.at(-1) ?? '{}');
      expect(payload.command).toBe('view');
      expect(payload.plugin).toBe('resend');
    } finally {
      process.chdir(originalCwd);
      console.info = originalInfo;
    }
  });
});
