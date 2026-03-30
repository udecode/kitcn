import { ResendPlugin } from '@kitcn/resend';
import { getEnv } from '../../get-env';

export const resend = ResendPlugin.configure({
  apiKey: getEnv().RESEND_API_KEY,
  webhookSecret: getEnv().RESEND_WEBHOOK_SECRET,
  initialBackoffMs: 30_000,
  retryAttempts: 5,
  // testMode defaults to true. Set to false in production once your domain is ready.
  testMode: true,
});
