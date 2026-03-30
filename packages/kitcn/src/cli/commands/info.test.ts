import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDefaultConfig,
  writeMinimalSchema,
  writePackageJson,
} from '../test-utils';
import {
  formatInfoOutput,
  handleInfoCommand,
  INFO_HELP_TEXT,
  parseInfoCommandArgs,
} from './info';

describe('cli/commands/info', () => {
  test('parseInfoCommandArgs supports json', () => {
    expect(parseInfoCommandArgs(['--json'])).toEqual({ json: true });
  });

  test('formatInfoOutput renders shadcn-style grouped sections', () => {
    const output = formatInfoOutput({
      schemaPlugins: ['resend'],
      installedPlugins: [
        {
          plugin: 'resend',
          packageName: '@kitcn/resend',
          schemaRegistered: true,
          lockfileRegistered: true,
          missingDependency: false,
          driftedFiles: 0,
          clean: true,
          defaultPreset: 'default',
          docs: {
            localPath: 'www/content/docs/plugins/resend.mdx',
            publicUrl: 'https://kitcn.dev/docs/plugins/resend',
          },
        },
      ],
      project: {
        backend: 'concave',
        functionsDir: 'convex',
        schemaPath: 'convex/schema.ts',
        schemaExists: true,
        lockfilePath: 'convex/plugins.lock.json',
        lockfileExists: true,
        kitcnVersion: '0.9.0',
        convexVersion: '1.0.0',
        configPath: 'concave.json',
        config: {
          lib: 'convex/lib',
          shared: 'convex/shared',
          env: 'convex/.env',
        },
      },
      mismatches: {
        schemaOnly: [],
        lockfileOnly: [],
      },
    } as any);

    expect(output).toContain('kitcn info');
    expect(output).toContain('Project');
    expect(output).toContain('Plugins');
    expect(output).toContain('backend');
    expect(output).toContain('resend');
  });

  test('handleInfoCommand(--help) prints info help', async () => {
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
      const exitCode = await handleInfoCommand(['info', '--help'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(infoLines.join('\n')).toContain(INFO_HELP_TEXT);
    } finally {
      console.info = originalInfo;
    }
  });

  test('handleInfoCommand(--json) emits project inspection payload', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-info-command-json-')
    );
    writePackageJson(tmpDir);
    writeMinimalSchema(tmpDir);

    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const infoLines: string[] = [];
    const originalInfo = console.info;
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    try {
      const exitCode = await handleInfoCommand(['info', '--json'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: (() => ({
          ...createDefaultConfig(),
          backend: 'concave' as const,
        })) as any,
      });
      expect(exitCode).toBe(0);
      const payload = JSON.parse(infoLines.at(-1) ?? '{}');
      expect(payload.project.functionsDir).toBe('convex');
      expect(payload.project.backend).toBe('concave');
    } finally {
      process.chdir(originalCwd);
      console.info = originalInfo;
    }
  });
});
