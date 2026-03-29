import { convexTable, defineSchema, text } from 'kitcn/orm';

export const messagesTable = convexTable('messages', {
  body: text().notNull(),
});

export const tables = {
  messages: messagesTable,
};

export default defineSchema(tables);
