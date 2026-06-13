/* biome-ignore-all lint: compile-time public API assertions only */

import { convexTable, integer, rankIndex, text, timestamp } from './index';

const cards = convexTable(
  'rank_index_order_type_cards',
  {
    score: integer().notNull(),
    status: text().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (t) => [
    rankIndex('cards_by_status_recent')
      .partitionBy(t.status)
      .orderBy({ column: t.updatedAt, direction: 'desc' })
      .orderBy({ column: t.score, direction: 'asc' }),
    rankIndex('cards_global_score').all().orderBy(t.score),
  ]
);

void cards;
