const FUNCTIONS_DIR_IMPORT_PLACEHOLDER = '__KITCN_FUNCTIONS_DIR__';
const PROJECT_CRPC_IMPORT_PLACEHOLDER = '__KITCN_PROJECT_CRPC_IMPORT__';

export const RESEND_WEBHOOK_TEMPLATE = `import { createResendCaller } from "${FUNCTIONS_DIR_IMPORT_PLACEHOLDER}/generated/plugins/resend.runtime";
import type { ResendApi } from "@kitcn/resend";
import type { PluginApiScope } from "kitcn/plugins";
import { publicRoute } from "${PROJECT_CRPC_IMPORT_PLACEHOLDER}";
import { resend } from "./plugin";

export const resendWebhook = publicRoute
  .use(resend.middleware())
  .post("/resend-webhook")
  .mutation(async ({ ctx, c }) => {
    const event = await (
      ctx as typeof ctx & PluginApiScope<"resend", ResendApi>
    ).api.resend.verifyWebhookEvent(c.req.raw);
    const caller = createResendCaller(ctx);
    await caller.handleEmailEvent({ event });
    return new Response(null, { status: 201 });
  });
`;
