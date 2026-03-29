import fs from 'node:fs';
import { join } from 'node:path';
import { defineInternalRegistryItem } from '../../define-item.js';
import { createRegistryFile } from '../../files.js';
import {
  INIT_HTTP_IMPORT_MARKER,
  INIT_HTTP_ROUTE_MARKER,
  INIT_HTTP_TEMPLATE,
} from '../../init/init-http.template.js';
import {
  createPlanFile,
  getHttpFilePath,
  renderInitTemplateContent,
  resolveRelativeImportPath,
} from '../../plan-helpers.js';
import type { PluginRegistryBuildPlanFilesParams } from '../../types.js';
import { RESEND_CRONS_TEMPLATE } from './resend-crons.template.js';
import { RESEND_EMAIL_TEMPLATE } from './resend-email.template.js';
import { RESEND_FUNCTIONS_TEMPLATE } from './resend-functions.template.js';
import { RESEND_PLUGIN_TEMPLATE } from './resend-plugin.template.js';
import { RESEND_SCHEMA_TEMPLATE } from './resend-schema.template.js';
import { RESEND_WEBHOOK_TEMPLATE } from './resend-webhook.template.js';

const RESEND_FILES = [
  createRegistryFile({
    id: 'resend-schema',
    path: 'schema.ts',
    target: 'lib',
    content: RESEND_SCHEMA_TEMPLATE,
  }),
  createRegistryFile({
    id: 'resend-functions',
    path: 'resend.ts',
    target: 'functions',
    content: RESEND_FUNCTIONS_TEMPLATE,
    requires: ['resend-schema'],
  }),
  createRegistryFile({
    id: 'resend-email',
    path: 'email.tsx',
    target: 'functions',
    content: RESEND_EMAIL_TEMPLATE,
    requires: ['resend-functions', 'resend-plugin'],
    dependencyHintMessage: 'React Email dependencies are required',
    dependencyHints: [
      '@react-email/components',
      '@react-email/render',
      'react-email',
      'react',
      'react-dom',
    ],
  }),
  createRegistryFile({
    id: 'resend-plugin',
    path: 'plugin.ts',
    target: 'lib',
    content: RESEND_PLUGIN_TEMPLATE,
    requires: ['resend-functions'],
  }),
  createRegistryFile({
    id: 'resend-webhook',
    path: 'webhook.ts',
    target: 'lib',
    content: RESEND_WEBHOOK_TEMPLATE,
    requires: ['resend-plugin', 'resend-functions'],
  }),
  createRegistryFile({
    id: 'resend-crons',
    path: 'crons.ts',
    target: 'lib',
    content: RESEND_CRONS_TEMPLATE,
    requires: ['resend-functions'],
  }),
] as const;

function buildResendHttpRegistrationPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const httpPath = getHttpFilePath(params.functionsDir);
  const baselineHttpSource = renderInitTemplateContent({
    template: INIT_HTTP_TEMPLATE,
    filePath: httpPath,
    functionsDir: params.functionsDir,
    crpcFilePath: params.roots.crpcFilePath,
  });
  const resendWebhookImportPath = resolveRelativeImportPath(
    httpPath,
    join(params.roots.libRootDir, 'webhook.ts')
  );
  let source = fs.existsSync(httpPath)
    ? fs.readFileSync(httpPath, 'utf8')
    : baselineHttpSource;

  if (!source.includes('resendWebhook')) {
    if (source.includes(INIT_HTTP_IMPORT_MARKER)) {
      source = source.replace(
        INIT_HTTP_IMPORT_MARKER,
        `import { resendWebhook } from '${resendWebhookImportPath}';\n${INIT_HTTP_IMPORT_MARKER}`
      );
    }
    if (source.includes(INIT_HTTP_ROUTE_MARKER)) {
      source = source.replace(
        INIT_HTTP_ROUTE_MARKER,
        `  resendWebhook,\n${INIT_HTTP_ROUTE_MARKER}`
      );
    }
  }

  return createPlanFile({
    kind: 'scaffold',
    filePath: httpPath,
    content: source,
    managedBaselineContent: baselineHttpSource,
    createReason: 'Create http.ts with resend webhook route.',
    updateReason: 'Register resend webhook in http.ts.',
    skipReason: 'Resend webhook is already registered in http.ts.',
  });
}

export const resendRegistryItem = defineInternalRegistryItem({
  item: {
    name: 'resend',
    type: 'registry:item',
    title: 'Resend',
    description:
      'Transactional email plugin with queueing, webhook handling, and React Email scaffolds.',
    categories: ['email', 'resend', 'webhook', 'react-email'],
    docs: 'https://kitcn.vercel.app/docs/plugins/resend',
    dependencies: ['@kitcn/resend'],
    files: RESEND_FILES,
  },
  internal: {
    localDocsPath: 'www/content/docs/plugins/resend.mdx',
    envFields: [
      {
        key: 'RESEND_API_KEY',
        schema: 'z.string().optional()',
        reminder: {
          message: 'Set before sending email through Resend.',
        },
      },
      {
        key: 'RESEND_WEBHOOK_SECRET',
        schema: 'z.string().optional()',
      },
      {
        key: 'RESEND_FROM_EMAIL',
        schema: 'z.string().optional()',
      },
    ],
    schemaRegistration: {
      importName: 'resendExtension',
      path: 'schema.ts',
      target: 'lib',
    },
    defaultPreset: 'default',
    presets: [
      {
        name: 'default',
        description: 'Scaffold resend plugin functions + lib helpers.',
        registryDependencies: RESEND_FILES.map((file) => file.meta.id),
      },
    ],
    integration: {
      buildPlanFiles: (params) => [buildResendHttpRegistrationPlanFile(params)],
    },
  },
});
