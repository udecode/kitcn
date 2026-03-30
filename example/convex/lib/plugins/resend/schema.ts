import {
  arrayOf,
  boolean,
  bytes,
  convexTable,
  defineSchemaExtension,
  index,
  integer,
  objectOf,
  text,
  textEnum,
  unionOf,
} from 'kitcn/orm';

export const resendContentTable = convexTable('resend_content', {
  content: bytes().notNull(),
  mimeType: text().notNull(),
  filename: text(),
  path: text(),
});

export const resendNextBatchRunTable = convexTable('resend_next_batch_run', {
  runId: text().notNull(),
});

export const resendDeliveryEventsTable = convexTable(
  'resend_delivery_events',
  {
    emailId: text().notNull(),
    resendId: text().notNull(),
    eventType: text().notNull(),
    createdAt: text().notNull(),
    message: text(),
  },
  (t) => [
    index('by_emailId').on(t.emailId),
    index('by_emailId_eventType').on(t.emailId, t.eventType),
  ]
);

export const resendEmailsTable = convexTable(
  'resend_emails',
  {
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
      variables: objectOf(
        unionOf(text().notNull(), integer().notNull()).notNull()
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
  },
  (t) => [
    index('by_status_segment').on(t.status, t.segment),
    index('by_resendId').on(t.resendId),
    index('by_finalizedAt').on(t.finalizedAt),
  ]
);

export function resendExtension() {
  return defineSchemaExtension('resend', {
    resendContent: resendContentTable,
    resendNextBatchRun: resendNextBatchRunTable,
    resendDeliveryEvents: resendDeliveryEventsTable,
    resendEmails: resendEmailsTable,
  }).relations((r) => ({
    resendEmails: {
      htmlContent: r.one.resendContent({
        from: r.resendEmails.html,
        to: r.resendContent.id,
        alias: 'htmlContent',
      }),
      textContent: r.one.resendContent({
        from: r.resendEmails.text,
        to: r.resendContent.id,
        alias: 'textContent',
      }),
      deliveryEvents: r.many.resendDeliveryEvents(),
    },
    resendDeliveryEvents: {
      email: r.one.resendEmails({
        from: r.resendDeliveryEvents.emailId,
        to: r.resendEmails.id,
      }),
    },
  }));
}
