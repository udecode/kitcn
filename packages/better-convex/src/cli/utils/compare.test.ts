import { isContentEquivalent } from './content-compare';

describe('cli/utils/compare', () => {
  test('treats formatting-only TypeScript changes as equivalent', () => {
    const existingContent = `
      import { text } from 'better-convex/orm';

      export const resendContentTable = convexTable('resend_content', {
        path: text(),
      });
    `.trim();

    const nextContent = `
      import { text } from "better-convex/orm";

      export const resendContentTable = convexTable("resend_content", {
        path: text(),
      });
    `.trim();

    expect(
      isContentEquivalent({
        filePath: 'convex/lib/plugins/resend/schema.ts',
        existingContent,
        nextContent,
      })
    ).toBe(true);
  });

  test('treats comment-only TypeScript changes as equivalent', () => {
    const existingContent = `
      import { ResendPlugin } from '@better-convex/resend';
      import { getEnv } from '../../get-env';

      export const resend = ResendPlugin.configure({
        apiKey: getEnv().RESEND_API_KEY,
        webhookSecret: getEnv().RESEND_WEBHOOK_SECRET,
        initialBackoffMs: 30_000,
        retryAttempts: 5,
        // testMode defaults to true. Set to false in production once your domain is ready.
        testMode: true,
      });
    `.trim();

    const nextContent = `
      import { ResendPlugin } from "@better-convex/resend";
      import { getEnv } from "../../get-env";

      export const resend = ResendPlugin.configure({
        apiKey: getEnv().RESEND_API_KEY,
        webhookSecret: getEnv().RESEND_WEBHOOK_SECRET,
        initialBackoffMs: 30_000,
        retryAttempts: 5,
        // Set to false in production once your domain is ready.
        testMode: true,
      });
    `.trim();

    expect(
      isContentEquivalent({
        filePath: 'convex/lib/plugins/resend/plugin.ts',
        existingContent,
        nextContent,
      })
    ).toBe(true);
  });

  test('preserves semantic TypeScript changes', () => {
    const existingContent = `
      export const resendContentTable = convexTable("resend_content", {
        path: text(),
      });
    `.trim();

    const nextContent = `
      export const resendContentTable = convexTable("resend_payload", {
        path: text(),
      });
    `.trim();

    expect(
      isContentEquivalent({
        filePath: 'convex/lib/plugins/resend/schema.ts',
        existingContent,
        nextContent,
      })
    ).toBe(false);
  });
});
