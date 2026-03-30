import { convexTable, timestamp } from '../index';

describe('timestamp() builder', () => {
  test('defaults to mode=date', () => {
    const events = convexTable('events_timestamp_builder_test', {
      startsAt: timestamp(),
    });

    expect(events.validator).toBeDefined();
    expect((events as any).startsAt).toBeDefined();
    expect(((events as any).startsAt as any).config.mode).toBe('date');
    expect(((events as any).startsAt as any).config.columnType).toBe(
      'ConvexTimestamp'
    );
  });

  test('supports mode=string', () => {
    const events = convexTable('events_timestamp_builder_mode_string_test', {
      startsAt: timestamp({ mode: 'string' }).notNull(),
    });

    const config = ((events as any).startsAt as any).config;
    expect(config.notNull).toBe(true);
    expect(config.mode).toBe('string');
    expect(config.columnType).toBe('ConvexTimestamp');
  });

  test('defaultNow uses Date in mode=date', () => {
    const events = convexTable('events_timestamp_builder_default_now_date', {
      startsAt: timestamp().notNull().defaultNow(),
    });

    const value = ((events as any).startsAt as any).config.defaultFn?.();
    expect(value).toBeInstanceOf(Date);
  });

  test('defaultNow uses ISO string in mode=string', () => {
    const events = convexTable('events_timestamp_builder_default_now_string', {
      startsAt: timestamp({ mode: 'string' }).notNull().defaultNow(),
    });

    const value = ((events as any).startsAt as any).config.defaultFn?.();
    expect(typeof value).toBe('string');
    expect(() => new Date(value as string)).not.toThrow();
    expect((value as string).includes('T')).toBe(true);
  });

  test('notNull + defaultNow is schema-migration compatible', () => {
    const events = convexTable(
      'events_timestamp_builder_migration_compatible',
      {
        createdAt: timestamp().notNull().defaultNow(),
      }
    );

    const createdAtField = (events.validator as any).json.value.createdAt;
    expect(createdAtField.optional).toBe(true);
    expect(createdAtField.fieldType).toEqual({ type: 'number' });
  });

  test('non-createdAt notNull + defaultNow stays required', () => {
    const events = convexTable('events_timestamp_builder_required_default', {
      startsAt: timestamp().notNull().defaultNow(),
    });

    const startsAtField = (events.validator as any).json.value.startsAt;
    expect(startsAtField.optional).toBe(false);
    expect(startsAtField.fieldType).toEqual({ type: 'number' });
  });
});
