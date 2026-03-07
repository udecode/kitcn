/** biome-ignore-all lint/performance/noBarrelFile: package entry */

import { definePlugin } from 'better-convex/plugins';
import type { ResendApi, ResendOptions } from './runtime-helpers';

export type { ResendApi, ResendOptions } from './runtime-helpers';
export {
  canUpgradeStatus,
  getRetryDelayMs,
  getSegment,
  isTestEmail,
  normalizeHeaders,
  normalizeRecipientList,
  parseEmailEvent,
  shouldRetry,
  verifyResendWebhookEvent,
} from './runtime-helpers';
export type {
  EmailEvent,
  EmailStatus,
  RuntimeConfig,
  SendEmailOptions,
  Status,
  Template,
} from './shared';

export const ResendPlugin = definePlugin<'resend', ResendOptions, ResendApi>(
  'resend',
  ({ options }) => ({
    apiKey: options?.apiKey ?? '',
    webhookSecret: options?.webhookSecret ?? '',
    initialBackoffMs: options?.initialBackoffMs ?? 30_000,
    retryAttempts: options?.retryAttempts ?? 5,
    testMode: options?.testMode ?? true,
  })
);
