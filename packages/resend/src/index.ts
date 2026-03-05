/** biome-ignore-all lint/performance/noBarrelFile: package entry */

import {
  definePluginMiddleware,
  type PluginMiddleware,
} from 'better-convex/plugins';
import {
  type ResendOptions,
  type ResendResolvedOptions,
  resolveResendOptions,
} from './runtime-helpers';

export type { ResendOptions, ResendResolvedOptions } from './runtime-helpers';
export {
  canUpgradeStatus,
  getRetryDelayMs,
  getSegment,
  isTestEmail,
  normalizeHeaders,
  normalizeRecipientList,
  parseEmailEvent,
  resolveResendOptions,
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

export const ResendPlugin: PluginMiddleware<
  { options: ResendResolvedOptions },
  ResendOptions,
  'resend',
  unknown
> = definePluginMiddleware<
  'resend',
  { options: ResendResolvedOptions },
  ResendOptions
>({
  key: 'resend',
  provide: ({ options }) => ({
    options: resolveResendOptions(options),
  }),
});
