import {
  arrayOf,
  boolean,
  bytes,
  type ConvexTable,
  convexTable,
  custom,
  index,
  integer,
  type OrmSchemaPlugin,
  objectOf,
  text,
  textEnum,
} from 'better-convex/orm';
import { v } from 'convex/values';

const RESEND_CONTENT_TABLE = 'resend_content';
const RESEND_NEXT_BATCH_RUN_TABLE = 'resend_next_batch_run';
const RESEND_DELIVERY_EVENTS_TABLE = 'resend_delivery_events';
const RESEND_EMAILS_TABLE = 'resend_emails';

const resendContentColumns = {
  content: bytes().notNull(),
  mimeType: text().notNull(),
  filename: text(),
  path: text(),
};

type ResendContentTable = ReturnType<
  typeof convexTable<typeof RESEND_CONTENT_TABLE, typeof resendContentColumns>
>;

const resendContentTable: ResendContentTable = convexTable(
  RESEND_CONTENT_TABLE,
  resendContentColumns
);

const resendNextBatchRunColumns = {
  runId: text().notNull(),
};

type ResendNextBatchRunTable = ReturnType<
  typeof convexTable<
    typeof RESEND_NEXT_BATCH_RUN_TABLE,
    typeof resendNextBatchRunColumns
  >
>;

const resendNextBatchRunTable: ResendNextBatchRunTable = convexTable(
  RESEND_NEXT_BATCH_RUN_TABLE,
  resendNextBatchRunColumns
);

const resendDeliveryEventsColumns = {
  emailId: text().notNull(),
  resendId: text().notNull(),
  eventType: text().notNull(),
  createdAt: text().notNull(),
  message: text(),
};

type ResendDeliveryEventsTable = ReturnType<
  typeof convexTable<
    typeof RESEND_DELIVERY_EVENTS_TABLE,
    typeof resendDeliveryEventsColumns
  >
>;

const resendDeliveryEventsTable: ResendDeliveryEventsTable = convexTable(
  RESEND_DELIVERY_EVENTS_TABLE,
  resendDeliveryEventsColumns,
  (t) => [
    index('by_emailId').on(t.emailId),
    index('by_emailId_eventType').on(t.emailId, t.eventType),
  ]
);

const resendEmailsColumns = {
  from: text().notNull(),
  to: arrayOf(text().notNull()).notNull(),
  cc: arrayOf(text().notNull()),
  bcc: arrayOf(text().notNull()),
  subject: text(),
  replyTo: arrayOf(text().notNull()).notNull(),
  html: text(),
  text: text(),
  template: objectOf({
    id: text().notNull(),
    variables: custom(
      v.record(v.string(), v.union(v.string(), v.number()))
    ).notNull(),
  }),
  headers: arrayOf(
    objectOf({
      name: text().notNull(),
      value: text().notNull(),
    })
  ),
  status: textEnum([
    'waiting',
    'queued',
    'cancelled',
    'sent',
    'delivered',
    'delivery_delayed',
    'bounced',
    'failed',
  ] as const).notNull(),
  complained: boolean().notNull(),
  errorMessage: text(),
  opened: boolean().notNull(),
  bounced: boolean(),
  failed: boolean(),
  deliveryDelayed: boolean(),
  clicked: boolean(),
  resendId: text(),
  segment: integer().notNull(),
  finalizedAt: integer().notNull(),
  sentAt: integer(),
  attempt: integer().notNull(),
};

type ResendEmailsTable = ReturnType<
  typeof convexTable<typeof RESEND_EMAILS_TABLE, typeof resendEmailsColumns>
>;

const resendEmailsTable: ResendEmailsTable = convexTable(
  RESEND_EMAILS_TABLE,
  resendEmailsColumns,
  (t) => [
    index('by_status_segment').on(t.status, t.segment),
    index('by_resendId').on(t.resendId),
    index('by_finalizedAt').on(t.finalizedAt),
  ]
);

export type ResendStorageTables = {
  resendContent: ResendContentTable;
  resendNextBatchRun: ResendNextBatchRunTable;
  resendDeliveryEvents: ResendDeliveryEventsTable;
  resendEmails: ResendEmailsTable;
};

export const resendStorageTables: ResendStorageTables = {
  resendContent: resendContentTable,
  resendNextBatchRun: resendNextBatchRunTable,
  resendDeliveryEvents: resendDeliveryEventsTable,
  resendEmails: resendEmailsTable,
};

const RESEND_PLUGIN_TABLE_NAMES = [
  RESEND_CONTENT_TABLE,
  RESEND_NEXT_BATCH_RUN_TABLE,
  RESEND_DELIVERY_EVENTS_TABLE,
  RESEND_EMAILS_TABLE,
] as const;

type ResendTableOverrides = Partial<
  Record<keyof ResendStorageTables, ConvexTable<any>>
>;

type ResolvedResendStorageTables<TOverrides extends ResendTableOverrides> =
  Omit<ResendStorageTables, keyof TOverrides> & TOverrides;

type ResendPluginOptions<TOverrides extends ResendTableOverrides> = {
  tables?: TOverrides;
};

function resolveResendStorageTables<TOverrides extends ResendTableOverrides>(
  options: ResendPluginOptions<TOverrides> | undefined
): ResolvedResendStorageTables<TOverrides> {
  return {
    ...resendStorageTables,
    ...(options?.tables ?? {}),
  } as ResolvedResendStorageTables<TOverrides>;
}

export function resendPlugin<
  const TOverrides extends ResendTableOverrides = {},
>(
  options?: ResendPluginOptions<TOverrides>
): OrmSchemaPlugin<ResolvedResendStorageTables<TOverrides>> {
  const storageTables = resolveResendStorageTables(options);
  return {
    key: 'resend',
    schema: {
      tableNames: RESEND_PLUGIN_TABLE_NAMES,
      inject: (schema) => injectResendStorageTables(schema, storageTables),
    },
  };
}

export function injectResendStorageTables<
  TSchema extends Record<string, unknown>,
  TStorageTables extends Record<string, unknown> = ResendStorageTables,
>(schema: TSchema, storageTables?: TStorageTables): TSchema & TStorageTables {
  const resolvedStorageTables =
    (storageTables as TStorageTables | undefined) ??
    (resendStorageTables as unknown as TStorageTables);
  const merged = {
    ...schema,
  } as TSchema & TStorageTables;

  for (const [tableName, tableDef] of Object.entries(resolvedStorageTables)) {
    if (
      tableName in schema &&
      (schema as Record<string, unknown>)[tableName] !== tableDef
    ) {
      throw new Error(
        `defineSchema cannot inject internal table '${tableName}' because the name is already in use.`
      );
    }
    (merged as Record<string, unknown>)[tableName] = tableDef;
  }

  return merged;
}
