import type { ResendApi } from '@kitcn/resend';
import type { PluginApiScope } from 'kitcn/plugins';
import { createResendCaller } from '../../../functions/generated/plugins/resend.runtime';
import { publicRoute } from '../../crpc';
import { resend } from './plugin';

export const resendWebhook = publicRoute
  .use(resend.middleware())
  .post('/resend-webhook')
  .mutation(async ({ ctx, c }) => {
    const event = await (
      ctx as typeof ctx & PluginApiScope<'resend', ResendApi>
    ).api.resend.verifyWebhookEvent(c.req.raw);
    const caller = createResendCaller(ctx);
    await caller.handleEmailEvent({ event });
    return new Response(null, { status: 201 });
  });
