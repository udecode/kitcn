/** biome-ignore-all lint/performance/noBarrelFile: package entry */

import { definePlugin, type Plugin } from 'better-convex/plugins';
import {
  type ResendApi,
  type ResendOptions,
  verifyResendWebhookEvent,
} from './runtime-helpers';

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
} from './runtime-helpers';
export type {
  EmailEvent,
  EmailStatus,
  RuntimeConfig,
  SendEmailOptions,
  Status,
  Template,
} from './shared';

export const ResendPlugin: Plugin<'resend', ResendOptions, ResendApi> =
  definePlugin('resend', ({ options }) => {
    const webhookSecret = options?.webhookSecret ?? '';
    return {
      apiKey: options?.apiKey ?? '',
      webhookSecret,
      initialBackoffMs: options?.initialBackoffMs ?? 30_000,
      retryAttempts: options?.retryAttempts ?? 5,
      testMode: options?.testMode ?? true,
      verifyWebhookEvent: (req: Request) =>
        verifyResendWebhookEvent(req, webhookSecret),
    };
  });
