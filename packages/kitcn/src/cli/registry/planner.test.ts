import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDefaultConfig,
  writeMinimalSchema,
  writePackageJson,
} from '../test-utils';
import { buildPluginInstallPlan, renderEnvHelperContent } from './planner';

describe('cli registry planner', () => {
  test('defaults SITE_URL to localhost:3000 in the generated env helper', () => {
    expect(renderEnvHelperContent([])).toContain(
      "SITE_URL: z.string().default('http://localhost:3000')"
    );
  });

  test('reconciles scaffold files before turning them into plan files', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-registry-reconcile-')
    );
    const originalCwd = process.cwd();
    process.chdir(dir);

    try {
      writePackageJson(dir);
      writeMinimalSchema(dir);

      const plan = await buildPluginInstallPlan({
        config: createDefaultConfig(),
        descriptor: {
          defaultPreset: 'default',
          description: 'fake',
          docs: {
            localPath: 'www/content/docs/fake.mdx',
            publicUrl: 'https://example.com/fake',
          },
          integration: {
            reconcileScaffoldFiles: async ({ scaffoldFiles }) =>
              scaffoldFiles.map((file) =>
                file.templateId === 'fake-template'
                  ? {
                      ...file,
                      content: 'reconciled content',
                    }
                  : file
              ),
          },
          key: 'resend',
          keywords: [],
          label: 'Fake',
          packageName: '@kitcn/fake',
          presets: [
            {
              description: 'default',
              key: 'default',
              templateIds: ['fake-template'],
            },
          ],
          schemaRegistration: {
            importName: 'fakeExtension',
            path: 'schema.ts',
            target: 'lib',
          },
          templates: [
            {
              content: 'original content',
              id: 'fake-template',
              path: 'plugins/fake.ts',
              target: 'functions',
              requires: [],
              dependencyHints: [],
            },
          ],
        },
        existingTemplatePathMap: {},
        functionsDir: path.join(dir, 'convex'),
        lockfile: { plugins: {} },
        noCodegen: true,
        overwrite: false,
        preset: 'default',
        preview: true,
        promptAdapter: {
          confirm: async () => true,
          isInteractive: () => false,
          multiselect: async () => [],
          select: async () => 'ignored',
        },
        presetTemplateIds: ['fake-template'],
        selectedPlugin: 'resend',
        selectedTemplateIds: ['fake-template'],
        selectedTemplates: [
          {
            content: 'original content',
            dependencyHints: [],
            id: 'fake-template',
            path: 'plugins/fake.ts',
            requires: [],
            target: 'functions',
          },
        ],
        selectionSource: 'preset',
        yes: false,
      });

      expect(
        plan.files.find((file) => file.templateId === 'fake-template')?.content
      ).toBe('reconciled content');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('adds a live bootstrap operation when the plugin requires local post-codegen bootstrap', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-registry-live-bootstrap-')
    );
    const originalCwd = process.cwd();
    process.chdir(dir);

    try {
      writePackageJson(dir);
      writeMinimalSchema(dir);

      const plan = await buildPluginInstallPlan({
        config: createDefaultConfig(),
        descriptor: {
          defaultPreset: 'default',
          description: 'fake',
          docs: {
            localPath: 'www/content/docs/fake.mdx',
            publicUrl: 'https://example.com/fake',
          },
          key: 'resend',
          keywords: [],
          label: 'Fake',
          liveBootstrap: {
            mode: 'local',
          },
          packageName: '@kitcn/fake',
          presets: [
            {
              description: 'default',
              key: 'default',
              templateIds: [],
            },
          ],
          schemaRegistration: {
            importName: 'fakeExtension',
            path: 'schema.ts',
            target: 'lib',
          },
          templates: [],
        },
        existingTemplatePathMap: {},
        functionsDir: path.join(dir, 'convex'),
        liveBootstrapTarget: 'local',
        lockfile: { plugins: {} },
        noCodegen: false,
        overwrite: false,
        preset: 'default',
        preview: true,
        promptAdapter: {
          confirm: async () => true,
          isInteractive: () => false,
          multiselect: async () => [],
          select: async () => 'ignored',
        },
        presetTemplateIds: [],
        selectedPlugin: 'resend',
        selectedTemplateIds: [],
        selectedTemplates: [],
        selectionSource: 'preset',
        yes: false,
      });

      expect(plan.operations).toContainEqual({
        kind: 'live_bootstrap',
        status: 'pending',
        reason: 'Run local bootstrap after scaffold changes.',
        command: 'kitcn dev --bootstrap',
      });
    } finally {
      process.chdir(originalCwd);
    }
  });
});
