const PROJECT_GET_ENV_IMPORT_PLACEHOLDER = '__KITCN_PROJECT_GET_ENV_IMPORT__';

export const RESEND_PLUGIN_TEMPLATE = `import { ResendPlugin } from '@kitcn/resend';
${PROJECT_GET_ENV_IMPORT_PLACEHOLDER}

export const resend = ResendPlugin.configure({
  apiKey: getEnv().RESEND_API_KEY,
  webhookSecret: getEnv().RESEND_WEBHOOK_SECRET,
  initialBackoffMs: 30_000,
  retryAttempts: 5,
  // testMode defaults to true. Set to false in production once your domain is ready.
  testMode: true,
});
`;
