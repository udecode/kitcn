import { v } from 'convex/values';
import {
  arrayOf,
  convexTable,
  custom,
  date,
  defineSchema,
  id,
  index,
  integer,
  objectOf,
  text,
  textEnum,
} from '../index';

const timelineEntryShape = {
  timestamp: v.number(),
  type: v.union(v.literal('status'), v.literal('milestone'), v.literal('note')),
  content: v.string(),
  addedBy: v.string(),
} as const;

const createProductionsWithCustom = (tableName: string) =>
  convexTable(
    tableName,
    {
      techPackId: id('techPacks').notNull(),
      quantity: integer().notNull(),
      estimatedCompletionDate: date(),
      status: textEnum([
        'pending',
        'in_progress',
        'completed',
        'cancelled',
      ] as const).notNull(),
      notes: text(),
      timeline: custom(v.array(v.object(timelineEntryShape))).notNull(),
      createdBy: text().notNull(),
    },
    (t) => [index('byTechPack').on(t.techPackId)]
  );

const createProductionsWithSugar = (tableName: string) =>
  convexTable(
    tableName,
    {
      techPackId: id('techPacks').notNull(),
      quantity: integer().notNull(),
      estimatedCompletionDate: date(),
      status: textEnum([
        'pending',
        'in_progress',
        'completed',
        'cancelled',
      ] as const).notNull(),
      notes: text(),
      timeline: arrayOf(objectOf(timelineEntryShape)).notNull(),
      createdBy: text().notNull(),
    },
    (t) => [index('byTechPack').on(t.techPackId)]
  );

const getTableExportWithoutName = (
  schema: { export(): string },
  tableName: string
) => {
  const exported = JSON.parse(schema.export()) as {
    tables: Array<Record<string, unknown>>;
  };

  const table = exported.tables.find((entry) => entry.tableName === tableName);
  expect(table).toBeDefined();

  const { tableName: _tableName, ...rest } = table as Record<string, unknown>;
  return rest;
};

describe('custom array/object sugar', () => {
  test('arrayOf(objectOf(...)) matches custom(v.array(v.object(...))) for timeline schemas', () => {
    const customProductions = createProductionsWithCustom(
      'productions_custom_timeline_test'
    );
    const sugarProductions = createProductionsWithSugar(
      'productions_sugar_timeline_test'
    );

    const customTimeline = (customProductions.validator as any).json.value
      .timeline;
    const sugarTimeline = (sugarProductions.validator as any).json.value
      .timeline;

    expect(sugarTimeline).toEqual(customTimeline);

    const customExport = getTableExportWithoutName(
      defineSchema({ productionsCustom: customProductions }) as any,
      'productionsCustom'
    );
    const sugarExport = getTableExportWithoutName(
      defineSchema({ productionsSugar: sugarProductions }) as any,
      'productionsSugar'
    );

    expect(sugarExport).toEqual(customExport);
  });

  test('objectOf(...) matches custom(v.object(...)) for nested object payloads', () => {
    const customEvents = convexTable('events_custom_payload_test', {
      payload: custom(
        v.object({
          actor: v.string(),
          metadata: v.object({
            source: v.string(),
          }),
        })
      ).notNull(),
    });

    const sugarEvents = convexTable('events_object_of_payload_test', {
      payload: objectOf({
        actor: v.string(),
        metadata: v.object({
          source: v.string(),
        }),
      }).notNull(),
    });

    const customPayload = (customEvents.validator as any).json.value.payload;
    const sugarPayload = (sugarEvents.validator as any).json.value.payload;

    expect(sugarPayload).toEqual(customPayload);
  });

  test('supports nested builder shape without direct v.* usage', () => {
    const productions = convexTable('productions_builder_nested_test', {
      timeline: arrayOf(
        objectOf({
          timestamp: integer().notNull(),
          type: textEnum(['status', 'milestone', 'note'] as const).notNull(),
          content: text().notNull(),
          addedBy: text().notNull(),
        })
      ).notNull(),
    });

    const timeline = (productions.validator as any).json.value.timeline;
    expect(timeline.optional).toBe(false);
    expect(timeline.fieldType.type).toBe('array');
    expect(timeline.fieldType.value.type).toBe('object');
  });

  test('arrayOf throws clear error for invalid element input', () => {
    expect(() => arrayOf(42 as any)).toThrow(
      'arrayOf(element) expected a column builder, Convex validator, or nested object shape. Got number.'
    );
  });

  test('objectOf throws clear error for invalid nested shape values', () => {
    expect(() => objectOf({ bad: 42 as any })).toThrow(
      'objectOf(shape).bad expected a column builder, Convex validator, or nested object shape. Got number.'
    );
  });
});
