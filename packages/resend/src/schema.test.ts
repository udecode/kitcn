import { convexTable, text } from 'better-convex/orm';
import { resendPlugin, resendStorageTables } from './schema';

test('resendPlugin allows overriding individual storage tables', () => {
  const customResendEmails = convexTable('resend_emails', {
    custom: text().notNull(),
  });

  const plugin = resendPlugin({
    tables: {
      resendEmails: customResendEmails,
    },
  });
  const injected = plugin.schema.inject({});

  expect(injected.resendEmails).toBe(customResendEmails);
  expect(injected.resendContent).toBe(resendStorageTables.resendContent);
});
