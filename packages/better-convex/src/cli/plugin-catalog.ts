import { RATELIMIT_PLUGIN_TEMPLATE } from './plugins/ratelimit/ratelimit-plugin.template.js';
import { RATELIMIT_SCHEMA_TEMPLATE } from './plugins/ratelimit/ratelimit-schema.template.js';
import { RESEND_CRONS_TEMPLATE } from './plugins/resend/resend-crons.template.js';
import { RESEND_EMAIL_TEMPLATE } from './plugins/resend/resend-email.template.js';
import { RESEND_FUNCTIONS_TEMPLATE } from './plugins/resend/resend-functions.template.js';
import { RESEND_PLUGIN_TEMPLATE } from './plugins/resend/resend-plugin.template.js';
import { RESEND_SCHEMA_TEMPLATE } from './plugins/resend/resend-schema.template.js';
import { RESEND_WEBHOOK_TEMPLATE } from './plugins/resend/resend-webhook.template.js';
export const FUNCTIONS_DIR_IMPORT_PLACEHOLDER =
  '__BETTER_CONVEX_FUNCTIONS_DIR__';
export const PLUGIN_CONFIG_IMPORT_PLACEHOLDER =
  '__BETTER_CONVEX_PLUGIN_CONFIG_IMPORT__';
export const PLUGIN_SCHEMA_IMPORT_PLACEHOLDER =
  '__BETTER_CONVEX_PLUGIN_SCHEMA_IMPORT__';
export const PROJECT_CRPC_IMPORT_PLACEHOLDER =
  '__BETTER_CONVEX_PROJECT_CRPC_IMPORT__';
export const PROJECT_SHARED_API_IMPORT_PLACEHOLDER =
  '__BETTER_CONVEX_PROJECT_SHARED_API_IMPORT__';
export const PROJECT_GET_ENV_IMPORT_PLACEHOLDER =
  '__BETTER_CONVEX_PROJECT_GET_ENV_IMPORT__';

export const SUPPORTED_PLUGIN_KEYS = ['resend', 'ratelimit'] as const;
export type SupportedPluginKey = (typeof SUPPORTED_PLUGIN_KEYS)[number];

export type PluginScaffoldTemplate = {
  id: string;
  path: string;
  target: 'functions' | 'lib';
  content: string;
  requires?: readonly string[];
  dependencyHintMessage?: string;
  dependencyHints?: readonly string[];
};

export type PluginPreset = {
  key: string;
  description: string;
  templateIds: readonly string[];
};

export type PluginEnvField = {
  key: string;
  schema: string;
  reminder?: {
    message?: string;
  };
};

export type PluginCatalogEntry = {
  key: SupportedPluginKey;
  label: string;
  description: string;
  keywords: readonly string[];
  docs: {
    localPath: string;
    publicUrl: string;
  };
  packageName: string;
  envFields?: readonly PluginEnvField[];
  schemaRegistration: {
    importName: string;
    path: string;
    target: 'functions' | 'lib';
  };
  defaultPreset: string;
  presets: readonly PluginPreset[];
  templates: readonly PluginScaffoldTemplate[];
};

const RESEND_TEMPLATES: readonly PluginScaffoldTemplate[] = [
  {
    id: 'resend-schema',
    path: 'schema.ts',
    target: 'lib',
    content: RESEND_SCHEMA_TEMPLATE,
  },
  {
    id: 'resend-functions',
    path: 'resend.ts',
    target: 'functions',
    content: RESEND_FUNCTIONS_TEMPLATE,
    requires: ['resend-schema'],
  },
  {
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
  },
  {
    id: 'resend-plugin',
    path: 'plugin.ts',
    target: 'lib',
    content: RESEND_PLUGIN_TEMPLATE,
    requires: ['resend-functions'],
  },
  {
    id: 'resend-webhook',
    path: 'webhook.ts',
    target: 'lib',
    content: RESEND_WEBHOOK_TEMPLATE,
    requires: ['resend-plugin', 'resend-functions'],
  },
  {
    id: 'resend-crons',
    path: 'crons.ts',
    target: 'lib',
    content: RESEND_CRONS_TEMPLATE,
    requires: ['resend-functions'],
  },
];

const RATELIMIT_TEMPLATES: readonly PluginScaffoldTemplate[] = [
  {
    id: 'ratelimit-schema',
    path: 'schema.ts',
    target: 'lib',
    content: RATELIMIT_SCHEMA_TEMPLATE,
  },
  {
    id: 'ratelimit-plugin',
    path: 'plugin.ts',
    target: 'lib',
    content: RATELIMIT_PLUGIN_TEMPLATE,
    requires: ['ratelimit-schema'],
  },
];

const PLUGIN_CATALOG: Record<SupportedPluginKey, PluginCatalogEntry> = {
  resend: {
    key: 'resend',
    label: 'Resend',
    description:
      'Transactional email plugin with queueing, webhook handling, and React Email scaffolds.',
    keywords: ['email', 'resend', 'webhook', 'react-email'],
    docs: {
      localPath: 'www/content/docs/plugins/resend.mdx',
      publicUrl: 'https://better-convex.vercel.app/docs/plugins/resend',
    },
    packageName: '@better-convex/resend',
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
        key: 'default',
        description: 'Scaffold resend plugin functions + lib helpers.',
        templateIds: RESEND_TEMPLATES.map((template) => template.id),
      },
    ],
    templates: RESEND_TEMPLATES,
  },
  ratelimit: {
    key: 'ratelimit',
    label: 'Ratelimit',
    description:
      'Reusable server-side rate limiting plugin with schema-backed buckets.',
    keywords: ['ratelimit', 'rate-limit', 'throttle'],
    docs: {
      localPath: 'www/content/docs/plugins/ratelimit.mdx',
      publicUrl: 'https://better-convex.vercel.app/docs/plugins/ratelimit',
    },
    packageName: 'better-convex',
    schemaRegistration: {
      importName: 'ratelimitExtension',
      path: 'schema.ts',
      target: 'lib',
    },
    defaultPreset: 'server-first',
    presets: [
      {
        key: 'server-first',
        description:
          'Scaffold a reusable ratelimit plugin and auto-register schema extension.',
        templateIds: ['ratelimit-schema', 'ratelimit-plugin'],
      },
      {
        key: 'schema-only',
        description: 'Only register ratelimit extension in schema.',
        templateIds: ['ratelimit-schema'],
      },
    ],
    templates: RATELIMIT_TEMPLATES,
  },
};

export function getPluginCatalogEntry(
  key: SupportedPluginKey
): PluginCatalogEntry {
  return PLUGIN_CATALOG[key];
}

export function getSupportedPluginKeys(): readonly SupportedPluginKey[] {
  return SUPPORTED_PLUGIN_KEYS;
}

export function isSupportedPluginKey(
  value: string
): value is SupportedPluginKey {
  return SUPPORTED_PLUGIN_KEYS.includes(value as SupportedPluginKey);
}
