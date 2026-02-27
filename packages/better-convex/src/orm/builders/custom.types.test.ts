import { expectTypeOf, test } from 'vitest';
import { arrayOf, integer, objectOf, text, textEnum } from '../index';
import { convexTable } from '../table';
import type { InferInsertModel, InferSelectModel } from '../types';

const productions = convexTable('productions_nested_types_test', {
  timeline: arrayOf(
    objectOf({
      timestamp: integer().notNull(),
      type: textEnum(['status', 'milestone', 'note'] as const).notNull(),
      content: text().notNull(),
      note: text(),
    })
  ).notNull(),
  payload: objectOf({
    actor: text().notNull(),
    source: text(),
  }).notNull(),
  optionalPayload: objectOf({
    actor: text().notNull(),
  }),
});

type ProductionSelect = InferSelectModel<typeof productions>;
type ProductionInsert = InferInsertModel<typeof productions>;

test('arrayOf/objectOf infer nested select and insert model types', () => {
  expectTypeOf<ProductionSelect['timeline']>().toEqualTypeOf<
    Array<{
      timestamp: number;
      type: 'status' | 'milestone' | 'note';
      content: string;
      note: string;
    }>
  >();

  expectTypeOf<ProductionInsert['timeline']>().toEqualTypeOf<
    Array<{
      timestamp: number;
      type: 'status' | 'milestone' | 'note';
      content: string;
      note: string;
    }>
  >();
});

test('objectOf keeps top-level column nullability semantics', () => {
  expectTypeOf<ProductionSelect['payload']>().toEqualTypeOf<{
    actor: string;
    source: string;
  }>();

  expectTypeOf<ProductionSelect['optionalPayload']>().toEqualTypeOf<{
    actor: string;
  } | null>();
});
