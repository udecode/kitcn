import { convexTable, text } from 'better-convex/orm';
import { ratelimitPlugin } from './schema';

test('ratelimitPlugin allows overriding individual storage tables', () => {
  const customStateTable = convexTable('ratelimit_state', {
    custom: text().notNull(),
  });

  const plugin = ratelimitPlugin({
    tables: {
      ratelimit_state: customStateTable,
    },
  });
  const injected = plugin.schema.inject({});

  expect(injected.ratelimit_state).toBe(customStateTable);
});
