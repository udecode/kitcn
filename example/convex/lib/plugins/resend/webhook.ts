import { verifyResendWebhookEvent } from '@better-convex/resend';
import type { HttpRouter } from 'convex/server';
import { createResendCaller } from '../../../functions/generated/plugins/resend.runtime';
import { publicRoute } from '../../crpc';
import { resend } from './plugin';

const webhookHandler = publicRoute
  .use(resend.middleware())
  .post('/resend-webhook')
  .mutation(async ({ ctx, c }) => {
    const event = await verifyResendWebhookEvent(
      c.req.raw,
      ctx.api.resend.webhookSecret
    );
    const caller = createResendCaller(ctx);
    await caller.handleEmailEvent({ event });
    return new Response(null, { status: 201 });
  });

export function registerResendWebhook(http: HttpRouter) {
  http.route({
    path: '/resend-webhook',
    method: 'POST',
    handler: webhookHandler,
  });
}
