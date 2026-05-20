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

  test('renders direct optional runtime env reads for marked fields', () => {
    const source = renderEnvHelperContent([
      {
        key: 'RESEND_API_KEY',
        readOptionalRuntimeEnv: true,
        schema: 'z.string().optional()',
      },
    ]);

    expect(source).toContain('readOptionalRuntimeEnv: [');
    expect(source).toContain("'RESEND_API_KEY'");
  });

  test('updates existing env helpers with direct optional runtime env reads', () => {
    const source = renderEnvHelperContent(
      [
        {
          key: 'RESEND_API_KEY',
          readOptionalRuntimeEnv: true,
          schema: 'z.string().optional()',
        },
      ],
      `import { createEnv } from 'kitcn/server';
import { z } from 'zod';

const envSchema = z.object({
  RESEND_API_KEY: z.string().optional(),
});

export const getEnv = createEnv({
  schema: envSchema,
});
`
    );

    expect(source).toContain('readOptionalRuntimeEnv: [');
    expect(source).toContain("'RESEND_API_KEY'");
  });

  test('keeps generated env helpers stable when direct optional runtime env reads already exist', () => {
    const fields = [
      {
        key: 'RESEND_API_KEY',
        readOptionalRuntimeEnv: true,
        schema: 'z.string().optional()',
      },
    ];
    const source = renderEnvHelperContent(fields);

    expect(renderEnvHelperContent(fields, source)).toBe(source);
  });

  test('updates existing env helpers when comments contain braces', () => {
    const source = renderEnvHelperContent(
      [
        {
          key: 'RESEND_API_KEY',
          readOptionalRuntimeEnv: true,
          schema: 'z.string().optional()',
        },
      ],
      `import { createEnv } from 'kitcn/server';
import { z } from 'zod';

const envSchema = z.object({
  JWKS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
});

export const getEnv = createEnv({
  // generated object closes with }
  readOptionalRuntimeEnv: [
    'JWKS',
  ],
  schema: envSchema,
});
`
    );

    expect(source.match(/readOptionalRuntimeEnv/g)).toHaveLength(1);
    expect(source).toContain("'JWKS'");
    expect(source).toContain("'RESEND_API_KEY'");
  });

  test('updates inline env helpers with direct optional runtime env reads', () => {
    const source = renderEnvHelperContent(
      [
        {
          key: 'RESEND_API_KEY',
          readOptionalRuntimeEnv: true,
          schema: 'z.string().optional()',
        },
      ],
      `import { createEnv } from 'kitcn/server';
import { z } from 'zod';

const envSchema = z.object({
  RESEND_API_KEY: z.string().optional(),
});

export const getEnv = createEnv({ schema: envSchema });
`
    );

    expect(source).toContain('readOptionalRuntimeEnv: [');
    expect(source).toContain("'RESEND_API_KEY'");
    expect(source).toContain('  schema: envSchema,\n});');
  });

  test('throws before duplicating non-literal direct optional runtime env reads', () => {
    expect(() =>
      renderEnvHelperContent(
        [
          {
            key: 'RESEND_API_KEY',
            readOptionalRuntimeEnv: true,
            schema: 'z.string().optional()',
          },
        ],
        `import { createEnv } from 'kitcn/server';
import { z } from 'zod';

const optionalKeys = ['JWKS'];
const envSchema = z.object({
  DEPLOY_ENV: z.string().default('production'),
  SITE_URL: z.string().default('http://localhost:3000'),
  RESEND_API_KEY: z.string().optional(),
});

export const getEnv = createEnv({
  readOptionalRuntimeEnv: optionalKeys,
  schema: envSchema,
});
`
      )
    ).toThrow('inline array');
  });

  test('throws before rewriting spread direct optional runtime env arrays', () => {
    expect(() =>
      renderEnvHelperContent(
        [
          {
            key: 'RESEND_API_KEY',
            readOptionalRuntimeEnv: true,
            schema: 'z.string().optional()',
          },
        ],
        `import { createEnv } from 'kitcn/server';
import { z } from 'zod';

const optionalKeys = ['JWKS'];
const envSchema = z.object({
  DEPLOY_ENV: z.string().default('production'),
  SITE_URL: z.string().default('http://localhost:3000'),
  RESEND_API_KEY: z.string().optional(),
});

export const getEnv = createEnv({
  readOptionalRuntimeEnv: [...optionalKeys],
  schema: envSchema,
});
`
      )
    ).toThrow('string literals');
  });

  test('throws before corrupting asserted direct optional runtime env arrays', () => {
    expect(() =>
      renderEnvHelperContent(
        [
          {
            key: 'RESEND_API_KEY',
            readOptionalRuntimeEnv: true,
            schema: 'z.string().optional()',
          },
        ],
        `import { createEnv } from 'kitcn/server';
import { z } from 'zod';

const envSchema = z.object({
  DEPLOY_ENV: z.string().default('production'),
  SITE_URL: z.string().default('http://localhost:3000'),
  RESEND_API_KEY: z.string().optional(),
});

export const getEnv = createEnv({
  readOptionalRuntimeEnv: ['JWKS'] as const,
  schema: envSchema,
});
`
      )
    ).toThrow('string literals');
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

  test('uses detected package manager in install plan commands', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-registry-package-manager-')
    );
    const originalCwd = process.cwd();
    process.chdir(dir);

    try {
      writePackageJson(dir, {
        name: 'test-app',
        packageManager: 'npm@10.9.0',
        private: true,
      });
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
          packageInstallSpec: '@kitcn/resend@0.12.5',
          packageName: '@kitcn/resend',
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
              dependencyHints: ['@react-email/render@1.0.0'],
              id: 'fake-template',
              path: 'plugins/fake.ts',
              requires: [],
              target: 'functions',
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
            dependencyHints: ['@react-email/render@1.0.0'],
            id: 'fake-template',
            path: 'plugins/fake.ts',
            requires: [],
            target: 'functions',
          },
        ],
        selectionSource: 'preset',
        yes: false,
      });

      expect(plan.nextSteps).toEqual([
        'Install scaffold dependencies: npm install @react-email/render@1.0.0',
      ]);
      expect(
        plan.operations.find(
          (operation) => operation.kind === 'dependency_install'
        )?.command
      ).toBe('npm install @kitcn/resend@0.12.5');
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
