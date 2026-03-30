/* biome-ignore-all lint: compile-time type assertions only */

import { createOrm, date, defineRelations, timestamp } from './index';
import { convexTable } from './table';
import type { InferSelectModel } from './types';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

const events = convexTable('events_temporal_type_test', {
  calendarDay: date(),
  calendarDayAsDate: date({ mode: 'date' }),
  occurredAt: timestamp(),
  occurredAtText: timestamp({ mode: 'string' }),
});

type EventRow = InferSelectModel<typeof events>;
type _calendarDayIsString = Expect<
  Equal<EventRow['calendarDay'], string | null>
>;
type _calendarDayAsDateIsDate = Expect<
  Equal<EventRow['calendarDayAsDate'], Date | null>
>;
type _occurredAtIsDate = Expect<Equal<EventRow['occurredAt'], Date | null>>;
type _occurredAtTextIsString = Expect<
  Equal<EventRow['occurredAtText'], string | null>
>;
type _systemCreatedAtIsNumber = Expect<Equal<EventRow['createdAt'], number>>;

const eventsWithCustomCreatedAt = convexTable(
  'events_temporal_custom_created_at_type_test',
  {
    createdAt: timestamp().notNull(),
    name: date(),
  }
);

type EventRowWithCustomCreatedAt = InferSelectModel<
  typeof eventsWithCustomCreatedAt
>;
type _customCreatedAtPreserved = Expect<
  Equal<EventRowWithCustomCreatedAt['createdAt'], Date>
>;

const schema = defineRelations({ events });
void createOrm({ schema });
// @ts-expect-error types.date global mode was removed
createOrm({ schema, types: { date: true } });
// @ts-expect-error triggers must be declared in defineSchema metadata
createOrm({ schema, triggers: {} });
