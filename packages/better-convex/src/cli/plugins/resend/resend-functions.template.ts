const FUNCTIONS_DIR_IMPORT_PLACEHOLDER = '__BETTER_CONVEX_FUNCTIONS_DIR__';
const PROJECT_CRPC_IMPORT_PLACEHOLDER = '__BETTER_CONVEX_PROJECT_CRPC_IMPORT__';
const PLUGIN_CONFIG_IMPORT_PLACEHOLDER =
  '__BETTER_CONVEX_PLUGIN_CONFIG_IMPORT__';
const PLUGIN_SCHEMA_IMPORT_PLACEHOLDER =
  '__BETTER_CONVEX_PLUGIN_SCHEMA_IMPORT__';

export const RESEND_FUNCTIONS_TEMPLATE = `import {
  canUpgradeStatus,
  getRetryDelayMs,
  getSegment,
  isTestEmail,
  normalizeHeaders,
  normalizeRecipientList,
  parseEmailEvent,
  shouldRetry,
} from '@better-convex/resend';
import { eq, inArray } from 'better-convex/orm';
import { z } from 'zod';
import { privateAction, privateMutation, privateQuery } from '${PROJECT_CRPC_IMPORT_PLACEHOLDER}';
import { resend } from '${PLUGIN_CONFIG_IMPORT_PLACEHOLDER}';
import {
  resendContentTable,
  resendDeliveryEventsTable,
  resendEmailsTable,
  resendNextBatchRunTable,
} from '${PLUGIN_SCHEMA_IMPORT_PLACEHOLDER}';
import {
  createResendCaller,
  createResendHandler,
} from '${FUNCTIONS_DIR_IMPORT_PLACEHOLDER}/generated/plugins/resend.runtime';
import type { MutationCtx } from '${FUNCTIONS_DIR_IMPORT_PLACEHOLDER}/generated/server';

const BATCH_SIZE = 100;
const RESEND_ONE_CALL_EVERY_MS = 600;
const FINALIZED_EMAIL_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
const FINALIZED_EPOCH = Number.MAX_SAFE_INTEGER;
const ABANDONED_EMAIL_RETENTION_MS = 1000 * 60 * 60 * 24 * 30;

const statusSchema = z.enum([
  'waiting',
  'queued',
  'cancelled',
  'sent',
  'delivered',
  'delivery_delayed',
  'bounced',
  'failed',
]);
const headersSchema = z.array(
  z.object({
    name: z.string(),
    value: z.string(),
  })
);
const templateSchema = z.object({
  id: z.string(),
  variables: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
const cleanupInputSchema = z.object({
  olderThan: z.number().optional(),
});

async function scheduleBatchRun(ctx: MutationCtx) {
  const existing = await ctx.orm.query.resendNextBatchRun.findFirst();
  if (existing) {
    return;
  }

  const caller = createResendCaller(ctx);
  const runId = await caller.schedule.now.makeBatch({});
  await ctx.orm.insert(resendNextBatchRunTable).values({
    runId: String(runId),
  });
}

async function cleanupEmailBatch(
  ctx: MutationCtx,
  emails: Array<{ id: string; html: string | null; text: string | null }>
) {
  if (emails.length === 0) {
    return;
  }

  const emailIds = [...new Set(emails.map((email) => email.id))];
  const contentIds = [
    ...new Set(
      emails
        .flatMap((email) => [email.html, email.text])
        .filter(
          (value): value is string =>
            typeof value === 'string' && value.length > 0
        )
    ),
  ];

  await ctx.orm
    .delete(resendDeliveryEventsTable)
    .where(inArray(resendDeliveryEventsTable.emailId, emailIds));
  await ctx.orm
    .delete(resendEmailsTable)
    .where(inArray(resendEmailsTable.id, emailIds));

  if (contentIds.length > 0) {
    await ctx.orm
      .delete(resendContentTable)
      .where(inArray(resendContentTable.id, contentIds));
  }
}

export const cleanupOldEmails = privateMutation
  .use(resend.middleware())
  .input(cleanupInputSchema)
  .mutation(async ({ ctx, input }) => {
    const olderThan = input.olderThan ?? FINALIZED_EMAIL_RETENTION_MS;
    const query = ctx.orm.query;
    const batch = await query.resendEmails.findMany({
      where: {
        finalizedAt: { lt: Date.now() - olderThan },
      },
      limit: BATCH_SIZE,
      columns: {
        id: true,
        html: true,
        text: true,
      },
    });

    await cleanupEmailBatch(ctx, batch ?? []);

    if ((batch?.length ?? 0) === BATCH_SIZE) {
      const caller = createResendCaller(ctx);
      await caller.schedule.now.cleanupOldEmails({ olderThan });
    }

    return null;
  });

export const cleanupAbandonedEmails = privateMutation
  .use(resend.middleware())
  .input(cleanupInputSchema)
  .mutation(async ({ ctx, input }) => {
    const olderThan = input.olderThan ?? ABANDONED_EMAIL_RETENTION_MS;
    const olderThanSegment = getSegment(Date.now() - olderThan);
    const query = ctx.orm.query;
    const batch = await query.resendEmails.findMany({
      where: {
        status: 'sent',
        segment: { lte: olderThanSegment },
      },
      limit: BATCH_SIZE,
      columns: {
        id: true,
        html: true,
        text: true,
      },
    });

    await cleanupEmailBatch(ctx, batch ?? []);

    if ((batch?.length ?? 0) === BATCH_SIZE) {
      const caller = createResendCaller(ctx);
      await caller.schedule.now.cleanupAbandonedEmails({ olderThan });
    }

    return null;
  });

export const sendEmail = privateMutation
  .use(resend.middleware())
  .input(
    z.object({
      from: z.string(),
      to: z.array(z.string()),
      cc: z.array(z.string()).optional(),
      bcc: z.array(z.string()).optional(),
      subject: z.string().optional(),
      html: z.string().optional(),
      text: z.string().optional(),
      template: templateSchema.optional(),
      replyTo: z.array(z.string()).optional(),
      headers: headersSchema.optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const args = input;
    const options = ctx.api.resend;

    if (options.testMode) {
      for (const address of [
        ...args.to,
        ...(args.cc ?? []),
        ...(args.bcc ?? []),
      ]) {
        if (!isTestEmail(address)) {
          throw new Error(
            'Test mode is enabled, but email address is not a valid resend test address. Set testMode: false when sending to real recipients.'
          );
        }
      }
    }

    const hasContent = args.html !== undefined || args.text !== undefined;
    const hasTemplate = args.template !== undefined;
    if (!hasContent && !hasTemplate) {
      throw new Error('Either html/text or template must be provided');
    }
    if (hasContent && hasTemplate) {
      throw new Error('Cannot provide both html/text and template');
    }
    if (!hasTemplate && !args.subject) {
      throw new Error('Subject is required when not using a template');
    }

    let htmlContentId: string | undefined;
    if (args.html !== undefined) {
      const [htmlContent] = await ctx.orm
        .insert(resendContentTable)
        .values({
          content: new TextEncoder().encode(args.html).buffer,
          mimeType: 'text/html',
        })
        .returning();
      htmlContentId = htmlContent.id;
    }

    let textContentId: string | undefined;
    if (args.text !== undefined) {
      const [textContent] = await ctx.orm
        .insert(resendContentTable)
        .values({
          content: new TextEncoder().encode(args.text).buffer,
          mimeType: 'text/plain',
        })
        .returning();
      textContentId = textContent.id;
    }

    const [email] = await ctx.orm
      .insert(resendEmailsTable)
      .values({
        from: args.from,
        to: args.to,
        cc: args.cc,
        bcc: args.bcc,
        subject: args.subject,
        html: htmlContentId,
        text: textContentId,
        template: args.template
          ? {
              id: args.template.id,
              variables: args.template.variables ?? {},
            }
          : undefined,
        headers: args.headers,
        status: 'waiting',
        complained: false,
        opened: false,
        bounced: false,
        failed: false,
        deliveryDelayed: false,
        clicked: false,
        replyTo: args.replyTo ?? [],
        segment: getSegment(Date.now()),
        finalizedAt: FINALIZED_EPOCH,
        attempt: 0,
      })
      .returning();

    await scheduleBatchRun(ctx);
    return email.id;
  });

export const createManualEmail = privateMutation
  .use(resend.middleware())
  .input(
    z.object({
      from: z.string(),
      to: z.union([z.string(), z.array(z.string())]),
      subject: z.string(),
      replyTo: z.array(z.string()).optional(),
      headers: headersSchema.optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const args = input;
    const [email] = await ctx.orm
      .insert(resendEmailsTable)
      .values({
        from: args.from,
        to: normalizeRecipientList(args.to),
        subject: args.subject,
        headers: args.headers,
        status: 'queued',
        complained: false,
        opened: false,
        bounced: false,
        failed: false,
        deliveryDelayed: false,
        clicked: false,
        replyTo: args.replyTo ?? [],
        segment: Number.MAX_SAFE_INTEGER,
        finalizedAt: FINALIZED_EPOCH,
        attempt: 0,
      })
      .returning();
    return email.id;
  });

export const updateManualEmail = privateMutation
  .use(resend.middleware())
  .input(
    z.object({
      emailId: z.string(),
      status: statusSchema,
      resendId: z.string().optional(),
      errorMessage: z.string().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const args = input;
    const finalizedAt =
      args.status === 'failed' || args.status === 'cancelled'
        ? Date.now()
        : undefined;

    await ctx.orm
      .update(resendEmailsTable)
      .set({
        status: args.status,
        resendId: args.resendId,
        errorMessage: args.errorMessage,
        ...(finalizedAt ? { finalizedAt } : {}),
      })
      .where(eq(resendEmailsTable.id, args.emailId));

    return null;
  });

export const cancelEmail = privateMutation
  .use(resend.middleware())
  .input(
    z.object({
      emailId: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const query = ctx.orm.query;
    const email = await query.resendEmails.findFirst({
      where: { id: input.emailId },
    });

    if (!email) {
      throw new Error('Email not found');
    }
    if (email.status !== 'waiting' && email.status !== 'queued') {
      throw new Error('Email has already been sent');
    }

    await ctx.orm
      .update(resendEmailsTable)
      .set({
        status: 'cancelled',
        finalizedAt: Date.now(),
      })
      .where(eq(resendEmailsTable.id, input.emailId));

    return null;
  });

export const getStatus = privateQuery
  .use(resend.middleware())
  .input(
    z.object({
      emailId: z.string(),
    })
  )
  .query(async ({ ctx, input }) => {
    const query = ctx.orm.query;
    const email = await query.resendEmails.findFirst({
      where: { id: input.emailId },
    });

    if (!email) {
      return null;
    }

    return {
      status: email.status,
      errorMessage: email.errorMessage ?? null,
      bounced: email.bounced ?? false,
      complained: email.complained ?? false,
      failed: email.failed ?? false,
      deliveryDelayed: email.deliveryDelayed ?? false,
      opened: email.opened ?? false,
      clicked: email.clicked ?? false,
    };
  });

export const get = privateQuery
  .use(resend.middleware())
  .input(
    z.object({
      emailId: z.string(),
    })
  )
  .query(async ({ ctx, input }) => {
    const query = ctx.orm.query;
    const email = await query.resendEmails.findFirst({
      where: { id: input.emailId },
    });

    if (!email) {
      return null;
    }

    const htmlContent = email.html
      ? await query.resendContent.findFirst({
          where: { id: email.html },
        })
      : null;

    const textContent = email.text
      ? await query.resendContent.findFirst({
          where: { id: email.text },
        })
      : null;

    const html =
      htmlContent?.content instanceof ArrayBuffer
        ? new TextDecoder().decode(new Uint8Array(htmlContent.content))
        : undefined;
    const text =
      textContent?.content instanceof ArrayBuffer
        ? new TextDecoder().decode(new Uint8Array(textContent.content))
        : undefined;

    return {
      ...email,
      html,
      text,
    };
  });

export const makeBatch = privateMutation
  .use(resend.middleware())
  .input(z.object({}))
  .mutation(async ({ ctx }) => {
    const caller = createResendCaller(ctx);
    await ctx.orm.delete(resendNextBatchRunTable).allowFullScan();

    const segment = getSegment(Date.now());
    const emails = await ctx.orm.query.resendEmails.findMany({
      where: {
        status: 'waiting',
        segment: { lte: segment },
      },
      limit: BATCH_SIZE,
    });

    if (!emails || emails.length === 0) {
      return null;
    }

    const emailIds = emails.map((email) => email.id);
    await ctx.orm
      .update(resendEmailsTable)
      .set({
        status: 'queued',
      })
      .where(inArray(resendEmailsTable.id, emailIds));

    await caller.schedule.after(1000).callResendAPIWithBatch({
      emailIds,
      attempt: 0,
    });

    if (emails.length === BATCH_SIZE) {
      await scheduleBatchRun(ctx);
    }

    return null;
  });

export const getAllContentByIds = privateQuery
  .use(resend.middleware())
  .input(
    z.object({
      contentIds: z.array(z.string()),
    })
  )
  .output(z.record(z.string(), z.string()))
  .query(async ({ ctx, input }) => {
    if (input.contentIds.length === 0) {
      return {};
    }

    const rows = await ctx.orm.query.resendContent.findMany({
      where: { id: { in: input.contentIds } },
      limit: input.contentIds.length,
      columns: {
        id: true,
        content: true,
      },
    });

    const entries: Array<readonly [string, string]> = [];
    for (const row of rows) {
      if (!(row.content instanceof ArrayBuffer)) {
        continue;
      }
      entries.push([
        row.id,
        new TextDecoder().decode(new Uint8Array(row.content)),
      ]);
    }

    return Object.fromEntries(entries);
  });

export const getEmailsByIds = privateQuery
  .use(resend.middleware())
  .input(
    z.object({
      emailIds: z.array(z.string()),
    })
  )
  .output(
    z.array(
      z.object({
        id: z.string(),
        status: statusSchema,
        from: z.string(),
        to: z.array(z.string()),
        cc: z.array(z.string()).nullable().optional(),
        bcc: z.array(z.string()).nullable().optional(),
        subject: z.string().nullable().optional(),
        html: z.string().nullable().optional(),
        text: z.string().nullable().optional(),
        template: templateSchema.nullable().optional(),
        replyTo: z.array(z.string()).nullable().optional(),
        headers: headersSchema.nullable().optional(),
      })
    )
  )
  .query(async ({ ctx, input }) => {
    if (input.emailIds.length === 0) {
      return [];
    }

    const rows = await ctx.orm.query.resendEmails.findMany({
      where: { id: { in: input.emailIds } },
      limit: input.emailIds.length,
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));

    return input.emailIds
      .map((emailId) => rowById.get(emailId))
      .filter((row): row is NonNullable<typeof row> => !!row);
  });

export const markEmailsFailed = privateMutation
  .use(resend.middleware())
  .input(
    z.object({
      emailIds: z.array(z.string()),
      errorMessage: z.string(),
      attempt: z.number(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const existingEmails = await ctx.orm.query.resendEmails.findMany({
      where: { id: { in: input.emailIds } },
      limit: input.emailIds.length,
      columns: {
        id: true,
        attempt: true,
      },
    });
    const attemptsById = new Map(
      existingEmails.map((email) => [email.id, email.attempt ?? 0])
    );

    for (const emailId of input.emailIds) {
      if (!attemptsById.has(emailId)) {
        continue;
      }

      await ctx.orm
        .update(resendEmailsTable)
        .set({
          status: 'failed',
          failed: true,
          errorMessage: input.errorMessage,
          finalizedAt: Date.now(),
          attempt: Math.max(attemptsById.get(emailId) ?? 0, input.attempt + 1),
        })
        .where(eq(resendEmailsTable.id, emailId));
    }

    return null;
  });

export const onEmailComplete = privateMutation
  .use(resend.middleware())
  .input(
    z.object({
      emailIds: z.array(z.string()),
      resendIds: z.array(z.string().nullable()),
      attempt: z.number(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    for (let index = 0; index < input.emailIds.length; index += 1) {
      const emailId = input.emailIds[index];
      const resendId = input.resendIds[index];
      if (!emailId) {
        continue;
      }
      if (!resendId) {
        await ctx.orm
          .update(resendEmailsTable)
          .set({
            status: 'failed',
            failed: true,
            errorMessage: 'Resend batch response did not include an email id.',
            finalizedAt: Date.now(),
            attempt: input.attempt + 1,
          })
          .where(eq(resendEmailsTable.id, emailId));
        continue;
      }

      await ctx.orm
        .update(resendEmailsTable)
        .set({
          status: 'sent',
          resendId,
          sentAt: Date.now(),
          attempt: input.attempt + 1,
        })
        .where(eq(resendEmailsTable.id, emailId));
    }

    return null;
  });

export const callResendAPIWithBatch = privateAction
  .use(resend.middleware())
  .input(
    z.object({
      emailIds: z.array(z.string()),
      attempt: z.number(),
    })
  )
  .action(async ({ ctx, input }) => {
    const args = input;
    const options = ctx.api.resend;
    const caller = createResendCaller(ctx);
    const emails = await caller.getEmailsByIds({
      emailIds: args.emailIds,
    });
    const queuedEmails = emails.filter((email) => email.status === 'queued');

    if (queuedEmails.length === 0) {
      return null;
    }

    const queuedEmailIds = queuedEmails.map((email) => email.id);

    const contentIds: string[] = [
      ...new Set(
        queuedEmails
          .flatMap((email) => [email.html, email.text])
          .filter(
            (value): value is string =>
              typeof value === 'string' && value.length > 0
          )
      ),
    ];

    const contentMap = await caller.getAllContentByIds({
      contentIds,
    });

    const payload = queuedEmails.map((email) => ({
      from: email.from,
      to: normalizeRecipientList(email.to),
      cc: normalizeRecipientList(email.cc ?? undefined),
      bcc: normalizeRecipientList(email.bcc ?? undefined),
      subject: email.subject,
      html: email.html ? contentMap[email.html] : undefined,
      text: email.text ? contentMap[email.text] : undefined,
      template: email.template ?? undefined,
      reply_to: email.replyTo,
      headers: normalizeHeaders(email.headers ?? undefined, email.id),
    }));

    /**
     * Use direct HTTP instead of the official Resend SDK to avoid pulling
     * React Email/render transitive deps into this Convex function bundle.
     */
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${options.apiKey}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const statusCode = response.status;
      const errorText = await response.text();
      if (shouldRetry(statusCode, args.attempt, options.retryAttempts)) {
        const nextAttempt = args.attempt + 1;
        const delayMs = Math.max(
          RESEND_ONE_CALL_EVERY_MS,
          getRetryDelayMs(options.initialBackoffMs, args.attempt)
        );

        await caller.schedule.after(delayMs).callResendAPIWithBatch({
          ...args,
          emailIds: queuedEmailIds,
          attempt: nextAttempt,
        });
        return null;
      }

      await caller.markEmailsFailed({
        emailIds: queuedEmailIds,
        errorMessage:
          errorText || \`Resend API request failed with status \${statusCode}.\`,
        attempt: args.attempt,
      });
      await caller.makeBatch({});
      return null;
    }

    const body = (await response.json().catch(() => null)) as {
      data?: Array<{ id?: string | null }> | null;
    };

    const resendIds = queuedEmailIds.map((_, index: number) => {
      const id = body.data?.[index]?.id;
      return typeof id === 'string' && id.length > 0 ? id : null;
    });

    await caller.onEmailComplete({
      emailIds: queuedEmailIds,
      resendIds,
      attempt: args.attempt,
    });

    await caller.schedule.after(RESEND_ONE_CALL_EVERY_MS).makeBatch({});

    return null;
  });

export const getEmailByResendId = privateQuery
  .use(resend.middleware())
  .input(
    z.object({
      resendId: z.string(),
    })
  )
  .query(async ({ ctx, input }) => {
    const query = ctx.orm.query;
    return await query.resendEmails.findFirst({
      where: { resendId: input.resendId },
    });
  });

export const handleEmailEvent = privateMutation
  .use(resend.middleware())
  .input(
    z.object({
      event: z.unknown(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const event = parseEmailEvent(input.event);
    if (!event) {
      return null;
    }

    const resendId = event.data.email_id;
    const query = ctx.orm.query;
    const email = await query.resendEmails.findFirst({
      where: { resendId },
    });

    if (!email) {
      return null;
    }

    const patch: Record<string, unknown> = {};
    const currentStatus = email.status;

    switch (event.type) {
      case 'email.sent':
        break;
      case 'email.delivered':
        if (canUpgradeStatus(currentStatus, 'delivered')) {
          patch.status = 'delivered';
          patch.finalizedAt = Date.now();
        }
        break;
      case 'email.delivery_delayed':
        if (!email.deliveryDelayed) {
          patch.deliveryDelayed = true;
        }
        if (canUpgradeStatus(currentStatus, 'delivery_delayed')) {
          patch.status = 'delivery_delayed';
        }
        break;
      case 'email.complained':
        if (!email.complained) {
          patch.complained = true;
        }
        if (email.finalizedAt === FINALIZED_EPOCH) {
          patch.finalizedAt = Date.now();
        }
        break;
      case 'email.bounced':
        if (!email.bounced) {
          patch.bounced = true;
        }
        patch.errorMessage = event.data.bounce.message;
        if (canUpgradeStatus(currentStatus, 'bounced')) {
          patch.status = 'bounced';
          patch.finalizedAt = Date.now();
        }
        break;
      case 'email.opened':
        if (!email.opened) {
          patch.opened = true;
        }
        break;
      case 'email.clicked':
        if (!email.clicked) {
          patch.clicked = true;
        }
        break;
      case 'email.failed':
        if (!email.failed) {
          patch.failed = true;
        }
        patch.errorMessage = event.data.failed.reason;
        if (canUpgradeStatus(currentStatus, 'failed')) {
          patch.status = 'failed';
          patch.finalizedAt = Date.now();
        }
        break;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.orm
        .update(resendEmailsTable)
        .set(patch)
        .where(eq(resendEmailsTable.id, email.id));
    }

    await ctx.orm.insert(resendDeliveryEventsTable).values({
      emailId: email.id,
      resendId,
      eventType: event.type,
      createdAt: event.created_at,
      message:
        event.type === 'email.bounced'
          ? event.data.bounce.message
          : event.type === 'email.failed'
            ? event.data.failed.reason
            : undefined,
    });

    const handler = createResendHandler(ctx);
    await handler.onEmailEvent({ id: email.id, event });

    return null;
  });

export const onEmailEvent = privateMutation
  .use(resend.middleware())
  .input(
    z.object({
      id: z.string(),
      event: z.unknown(),
    })
  )
  .mutation(async ({ input }) => {
    // TODO: fan out delivery/open/click/bounce events to your app domain.
    void input;
    return null;
  });
`;
