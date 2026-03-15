import { authExtension } from '../lib/plugins/auth/schema';
import { convexTable, defineSchema, text } from 'better-convex/orm';

export const messagesTable = convexTable('messages', {
  body: text().notNull(),
});

export const tables = {
  messages: messagesTable,
};

export default defineSchema(tables).extend(authExtension());
