import { Webhook } from 'svix';
import type { EmailEvent, RuntimeConfig, Status } from './shared';
import { ACCEPTED_EVENT_TYPES } from './shared';

const SEGMENT_MS = 125;

const PERMANENT_ERROR_CODES = new Set([
  400, 401, 403, 404, 405, 406, 407, 408, 410, 411, 413, 414, 415, 416, 418,
  421, 422, 426, 427, 428, 431,
]);

const RESEND_TEST_EMAIL_REGEX =
  /^(delivered|bounced|complained)(\+[a-zA-Z0-9_-]*)?@resend\.dev$/;

const EMAIL_STATUS_RANK: Record<Status, number> = {
  waiting: 0,
  queued: 1,
  sent: 2,
  delivery_delayed: 3,
  delivered: 4,
  bounced: 5,
  failed: 5,
  cancelled: 100,
};

type Header = { name: string; value: string };

export type ResendOptions = Partial<RuntimeConfig> & {
  webhookSecret?: string;
};

export type ResendApi = RuntimeConfig & {
  webhookSecret: string;
  verifyWebhookEvent(req: Request): Promise<EmailEvent>;
};

export function getSegment(now: number): number {
  return Math.floor(now / SEGMENT_MS);
}

export function isTestEmail(email: string): boolean {
  return RESEND_TEST_EMAIL_REGEX.test(email);
}

export function normalizeRecipientList(
  value: string | string[] | undefined
): string[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function normalizeHeaders(
  headers: Header[] | undefined,
  idempotencyKey: string
): Record<string, string> {
  const merged = Object.fromEntries(
    (headers ?? []).map((header) => [header.name, header.value])
  ) as Record<string, string>;

  const hasIdempotencyKey = Object.keys(merged).some(
    (headerName) => headerName.toLowerCase() === 'idempotency-key'
  );
  if (!hasIdempotencyKey) {
    merged['Idempotency-Key'] = idempotencyKey;
  }

  return merged;
}

export function shouldRetry(
  status: number,
  attempt: number,
  retryAttempts: number
): boolean {
  if (attempt >= retryAttempts) {
    return false;
  }
  if (status === 429) {
    return true;
  }
  if (status >= 500) {
    return true;
  }
  return !PERMANENT_ERROR_CODES.has(status);
}

export function getRetryDelayMs(
  initialBackoffMs: number,
  attempt: number
): number {
  return initialBackoffMs * 2 ** attempt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseEmailEvent(value: unknown): EmailEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const eventType = value.type;
  const createdAt = value.created_at;
  const eventData = value.data;

  if (
    typeof eventType !== 'string' ||
    typeof createdAt !== 'string' ||
    !isRecord(eventData)
  ) {
    return null;
  }
  if (!(ACCEPTED_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return null;
  }
  if (typeof eventData.email_id !== 'string') {
    return null;
  }

  if (
    eventType === 'email.bounced' &&
    (!isRecord(eventData.bounce) ||
      typeof eventData.bounce.message !== 'string')
  ) {
    return null;
  }

  if (
    eventType === 'email.failed' &&
    (!isRecord(eventData.failed) || typeof eventData.failed.reason !== 'string')
  ) {
    return null;
  }

  return value as EmailEvent;
}

export function canUpgradeStatus(
  currentStatus: Status,
  nextStatus: Status
): boolean {
  if (currentStatus === 'cancelled') {
    return false;
  }
  return EMAIL_STATUS_RANK[nextStatus] > EMAIL_STATUS_RANK[currentStatus];
}

export async function verifyResendWebhookEvent(
  req: Request,
  webhookSecret: string
): Promise<EmailEvent> {
  if (!webhookSecret) {
    throw new Error('Webhook secret is not set');
  }

  const webhook = new Webhook(webhookSecret);
  const raw = await req.text();
  const payload = webhook.verify(raw, {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  });

  const parsed = parseEmailEvent(payload);
  if (!parsed) {
    throw new Error('Invalid Resend webhook payload');
  }
  return parsed;
}
