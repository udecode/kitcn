export type Status =
  | 'waiting'
  | 'queued'
  | 'cancelled'
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'failed';

export type Template = {
  id: string;
  variables?: Record<string, string | number>;
};

export type RuntimeConfig = {
  initialBackoffMs: number;
  retryAttempts: number;
  apiKey: string;
  testMode: boolean;
};

type Recipient = string | string[];
type Header = { name: string; value: string };

type CommonEventFields = {
  broadcast_id?: string;
  created_at: string;
  email_id: string;
  from: Recipient;
  to: Recipient;
  cc?: Recipient;
  bcc?: Recipient;
  reply_to?: Recipient;
  headers?: Header[];
  subject: string;
};

export const ACCEPTED_EVENT_TYPES = [
  'email.sent',
  'email.delivered',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
] as const;

type BaseEmailEvent<TType extends (typeof ACCEPTED_EVENT_TYPES)[number]> = {
  type: TType;
  created_at: string;
  data: CommonEventFields;
};

type BouncedEmailEvent = BaseEmailEvent<'email.bounced'> & {
  data: CommonEventFields & {
    bounce: {
      message: string;
      subType: string;
      type: string;
    };
  };
};

type OpenedEmailEvent = BaseEmailEvent<'email.opened'> & {
  data: CommonEventFields & {
    open: {
      ipAddress: string;
      timestamp: string;
      userAgent: string;
    };
  };
};

type ClickedEmailEvent = BaseEmailEvent<'email.clicked'> & {
  data: CommonEventFields & {
    click: {
      ipAddress: string;
      link: string;
      timestamp: string;
      userAgent: string;
    };
  };
};

type FailedEmailEvent = BaseEmailEvent<'email.failed'> & {
  data: CommonEventFields & {
    failed: {
      reason: string;
    };
  };
};

export type EmailEvent =
  | BaseEmailEvent<'email.sent'>
  | BaseEmailEvent<'email.delivered'>
  | BaseEmailEvent<'email.delivery_delayed'>
  | BaseEmailEvent<'email.complained'>
  | BouncedEmailEvent
  | OpenedEmailEvent
  | ClickedEmailEvent
  | FailedEmailEvent;

export type SendEmailOptions =
  | {
      from: string;
      to: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      subject: string;
      html?: string;
      text?: string;
      replyTo?: string[];
      headers?: { name: string; value: string }[];
    }
  | {
      from: string;
      to: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      subject?: string;
      template: {
        id: string;
        variables?: Record<string, string | number>;
      };
      html?: never;
      text?: never;
      replyTo?: string[];
      headers?: { name: string; value: string }[];
    };

export type EmailStatus = {
  status: Status;
  errorMessage: string | null;
  bounced: boolean;
  complained: boolean;
  failed: boolean;
  deliveryDelayed: boolean;
  opened: boolean;
  clicked: boolean;
};
