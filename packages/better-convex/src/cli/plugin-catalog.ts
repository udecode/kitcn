import { RATELIMIT_PLUGIN_TEMPLATE } from './plugins/ratelimit/ratelimit-plugin.template.js';
import { RATELIMIT_SCHEMA_TEMPLATE } from './plugins/ratelimit/ratelimit-schema.template.js';
import { RESEND_FUNCTIONS_TEMPLATE } from './plugins/resend/resend.template.js';
import { RESEND_SCHEMA_TEMPLATE } from './plugins/resend/resend-schema.template.js';
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
export const PROJECT_GET_ENV_ACCESS_PLACEHOLDER =
  '__BETTER_CONVEX_PROJECT_GET_ENV_ACCESS__';

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

function emitResendFunctionsTemplate() {
  return RESEND_FUNCTIONS_TEMPLATE;
}

function emitResendPluginTemplate() {
  return `import { ResendPlugin } from "@better-convex/resend";
${PROJECT_GET_ENV_IMPORT_PLACEHOLDER}

export const resend = ResendPlugin.configure({
  apiKey: ${PROJECT_GET_ENV_ACCESS_PLACEHOLDER}.RESEND_API_KEY,
  webhookSecret: ${PROJECT_GET_ENV_ACCESS_PLACEHOLDER}.RESEND_WEBHOOK_SECRET,
  initialBackoffMs: 30_000,
  retryAttempts: 5,
  // Set to false in production once your domain is ready.
  testMode: true,
});
`;
}

function emitResendSchemaTemplate() {
  return RESEND_SCHEMA_TEMPLATE;
}

function emitResendWebhookTemplate() {
  return `import { verifyResendWebhookEvent } from "@better-convex/resend";
import type { HttpRouter } from "convex/server";
import { createResendCaller } from "${FUNCTIONS_DIR_IMPORT_PLACEHOLDER}/generated/plugins/resend.runtime";
import { publicRoute } from "${PROJECT_CRPC_IMPORT_PLACEHOLDER}";
import { resend } from "./plugin";

const webhookHandler = publicRoute
  .use(resend.middleware())
  .post("/resend-webhook")
  .mutation(async ({ ctx, c }) => {
    const event = await verifyResendWebhookEvent(
      c.req.raw,
      ctx.api.resend.webhookSecret,
    );
    const caller = createResendCaller(ctx);
    await caller.handleEmailEvent({ event });
    return new Response(null, { status: 201 });
  });

export function registerResendWebhook(http: HttpRouter) {
  http.route({
    path: "/resend-webhook",
    method: "POST",
    handler: webhookHandler,
  });
}
`;
}

function emitResendCronsTemplate() {
  return `import { cronJobs } from "convex/server";
import { internal } from "${FUNCTIONS_DIR_IMPORT_PLACEHOLDER}/_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup resend plugin emails",
  { hours: 1 },
  internal.plugins.resend.cleanupOldEmails,
  {},
);

crons.interval(
  "cleanup resend abandoned plugin emails",
  { hours: 6 },
  internal.plugins.resend.cleanupAbandonedEmails,
  {},
);

export default crons;
`;
}

function emitResendEmailTemplate() {
  return `'use node';

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";
import { z } from "zod";
import { createResendCaller } from "${FUNCTIONS_DIR_IMPORT_PLACEHOLDER}/generated/plugins/resend.runtime";
import { privateAction } from "${PROJECT_CRPC_IMPORT_PLACEHOLDER}";
${PROJECT_GET_ENV_IMPORT_PLACEHOLDER}

type GenericEmailTemplateProps = {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

function GenericEmailTemplate({
  title,
  body,
  ctaLabel,
  ctaUrl,
}: GenericEmailTemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ backgroundColor: "#f6f9fc", padding: "24px 0" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            margin: "0 auto",
            maxWidth: "600px",
            padding: "24px",
          }}
        >
          <Heading style={{ fontSize: "24px", margin: "0 0 12px" }}>
            {title}
          </Heading>
          <Text style={{ fontSize: "15px", lineHeight: "1.6", margin: "0" }}>
            {body}
          </Text>
          {ctaLabel && ctaUrl ? (
            <Section style={{ marginTop: "20px", textAlign: "center" }}>
              <Button
                href={ctaUrl}
                style={{
                  backgroundColor: "#111827",
                  borderRadius: "6px",
                  color: "#ffffff",
                  display: "inline-block",
                  fontSize: "14px",
                  padding: "10px 16px",
                  textDecoration: "none",
                }}
              >
                {ctaLabel}
              </Button>
            </Section>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

export const sendTemplatedEmail = privateAction
  .input(
    z.object({
      to: z.string(),
      from: z.string().optional(),
      subject: z.string(),
      title: z.string(),
      body: z.string(),
      ctaLabel: z.string().optional(),
      ctaUrl: z.string().optional(),
    }),
  )
  .output(z.string())
  .action(async ({ ctx, input }) => {
    const from = input.from ?? ${PROJECT_GET_ENV_ACCESS_PLACEHOLDER}.RESEND_FROM_EMAIL;
    if (!from) {
      throw new Error(
        'Missing sender email. Provide "from" or set RESEND_FROM_EMAIL.',
      );
    }

    const html = await render(
      <GenericEmailTemplate
        title={input.title}
        body={input.body}
        ctaLabel={input.ctaLabel}
        ctaUrl={input.ctaUrl}
      />,
    );

    const caller = createResendCaller(ctx);
    return await caller.sendEmail({
      from,
      to: [input.to],
      subject: input.subject,
      html,
    });
  });
`;
}

function emitRatelimitPluginTemplate() {
  return RATELIMIT_PLUGIN_TEMPLATE;
}

function emitRatelimitSchemaTemplate() {
  return RATELIMIT_SCHEMA_TEMPLATE;
}

const RESEND_TEMPLATES: readonly PluginScaffoldTemplate[] = [
  {
    id: 'resend-schema',
    path: 'schema.ts',
    target: 'lib',
    content: emitResendSchemaTemplate(),
  },
  {
    id: 'resend-functions',
    path: 'resend.ts',
    target: 'functions',
    content: emitResendFunctionsTemplate(),
    requires: ['resend-schema'],
  },
  {
    id: 'resend-email',
    path: 'email.tsx',
    target: 'functions',
    content: emitResendEmailTemplate(),
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
    content: emitResendPluginTemplate(),
    requires: ['resend-functions'],
  },
  {
    id: 'resend-webhook',
    path: 'webhook.ts',
    target: 'lib',
    content: emitResendWebhookTemplate(),
    requires: ['resend-plugin', 'resend-functions'],
  },
  {
    id: 'resend-crons',
    path: 'crons.ts',
    target: 'lib',
    content: emitResendCronsTemplate(),
    requires: ['resend-functions'],
  },
];

const RATELIMIT_TEMPLATES: readonly PluginScaffoldTemplate[] = [
  {
    id: 'ratelimit-schema',
    path: 'schema.ts',
    target: 'lib',
    content: emitRatelimitSchemaTemplate(),
  },
  {
    id: 'ratelimit-plugin',
    path: 'plugin.ts',
    target: 'lib',
    content: emitRatelimitPluginTemplate(),
    requires: ['ratelimit-schema'],
  },
];

const PLUGIN_CATALOG: Record<SupportedPluginKey, PluginCatalogEntry> = {
  resend: {
    key: 'resend',
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
