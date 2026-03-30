import { convexTable, date } from '../index';

describe('date() builder', () => {
  test('creates optional string validator by default', () => {
    const events = convexTable('events_date_builder_test', {
      startsAt: date(),
    });

    expect(events.validator).toBeDefined();
    expect((events as any).startsAt).toBeDefined();
    expect(((events as any).startsAt as any).config.mode).toBe('string');
  });

  test('supports mode=date with Date defaults in column config', () => {
    const now = new Date('2026-02-14T00:00:00.000Z');
    const events = convexTable('events_date_builder_not_null_test', {
      startsAt: date({ mode: 'date' }).notNull().default(now),
    });

    const config = ((events as any).startsAt as any).config;
    expect(config.notNull).toBe(true);
    expect(config.default).toBe(now);
    expect(config.columnType).toBe('ConvexDate');
    expect(config.mode).toBe('date');
  });

  test('defaultNow uses Date in mode=date', () => {
    const events = convexTable('events_date_builder_default_now_date_test', {
      startsAt: date({ mode: 'date' }).notNull().defaultNow(),
    });

    const value = ((events as any).startsAt as any).config.defaultFn?.();
    expect(value).toBeInstanceOf(Date);
  });

  test('defaultNow uses yyyy-mm-dd string in mode=string', () => {
    const events = convexTable('events_date_builder_default_now_string_test', {
      startsAt: date().notNull().defaultNow(),
    });

    const value = ((events as any).startsAt as any).config.defaultFn?.();
    expect(typeof value).toBe('string');
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
