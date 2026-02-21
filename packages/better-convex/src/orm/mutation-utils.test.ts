/** biome-ignore-all lint/performance/useTopLevelRegex: inline regex assertions are intentional in tests. */
import { and, eq, gt, isNull, not, or } from './filter-expression';
import { convexTable, date, integer, text, timestamp } from './index';
import {
  applyDefaults,
  decodeUndefinedDeep,
  deserializeFilterExpression,
  encodeUndefinedDeep,
  enforceCheckConstraints,
  evaluateCheckConstraintTriState,
  evaluateFilter,
  getMutationCollectionLimits,
  getSelectionColumnName,
  hydrateDateFieldsForRead,
  normalizeDateFieldsForWrite,
  selectReturningRow,
  selectReturningRowWithHydration,
  serializeFilterExpression,
  takeRowsWithinByteBudget,
  toConvexFilter,
} from './mutation-utils';

const users = convexTable('users', {
  name: text().notNull(),
  age: integer(),
  deletedAt: integer(),
  status: text(),
  birthday: date({ mode: 'date' }),
  holiday: date(),
  startsAt: timestamp(),
  loggedAt: timestamp({ mode: 'string' }),
});

const usersWithCreatedAt = convexTable('users_with_created_at', {
  name: text().notNull(),
  createdAt: integer().notNull(),
});

const usersWithTimestampCreatedAt = convexTable(
  'users_with_timestamp_created_at',
  {
    name: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  }
);

describe('mutation-utils', () => {
  test('encodeUndefinedDeep/decodeUndefinedDeep round-trip nested values', () => {
    const input = {
      name: 'Alice',
      optional: undefined,
      nested: {
        maybe: undefined,
        list: [1, undefined, { value: undefined }],
      },
    };

    const encoded = encodeUndefinedDeep(input);
    expect(encoded).not.toEqual(input);

    const decoded = decodeUndefinedDeep(encoded);
    expect(decoded).toEqual(input);
  });

  test('serialize/deserialize filter expressions validates malformed unary payloads', () => {
    const serialized = serializeFilterExpression(eq(users.name, 'Alice'));
    expect(serialized).toBeTruthy();
    expect(deserializeFilterExpression(serialized)).toBeTruthy();

    expect(() =>
      deserializeFilterExpression({
        type: 'unary',
        operator: 'not',
        operand: undefined as any,
      })
    ).toThrow(/missing/i);
  });

  test('serializeFilterExpression rejects binary expressions without field reference', () => {
    const invalid = {
      type: 'binary',
      operator: 'eq',
      operands: [123, 'x'],
      accept() {
        throw new Error('not used');
      },
    };

    expect(() => serializeFilterExpression(invalid as any)).toThrow(
      /FieldReference/
    );
  });

  test('selection helpers resolve column names and map returning rows', () => {
    expect(getSelectionColumnName({ columnName: 'name' })).toBe('name');
    expect(getSelectionColumnName({ config: { name: 'email' } })).toBe('email');
    expect(() => getSelectionColumnName({})).toThrow(
      /must reference a column/i
    );

    const row = { name: 'Alice', email: 'alice@example.com', age: 30 };
    const selected = selectReturningRow(row, {
      n: { columnName: 'name' },
      e: { config: { name: 'email' } },
    });
    expect(selected).toEqual({ n: 'Alice', e: 'alice@example.com' });
  });

  test('evaluateFilter supports binary/unary/logical operators', () => {
    const row = {
      name: 'Alice',
      age: 30,
      tags: ['a', 'b'],
      deletedAt: null,
    };

    expect(evaluateFilter(row, eq(users.name, 'Alice'))).toBe(true);
    expect(evaluateFilter(row, not(eq(users.name, 'Bob')))).toBe(true);
    expect(
      evaluateFilter(row, and(gt(users.age, 18), isNull(users.deletedAt))!)
    ).toBe(true);
    expect(
      evaluateFilter(row, or(eq(users.name, 'Zed'), eq(users.name, 'Alice'))!)
    ).toBe(true);
  });

  test('evaluateCheckConstraintTriState returns unknown for nullish comparisons', () => {
    const expression = gt(users.age, 18);

    expect(evaluateCheckConstraintTriState({ age: 30 }, expression)).toBe(true);
    expect(evaluateCheckConstraintTriState({ age: 10 }, expression)).toBe(
      false
    );
    expect(evaluateCheckConstraintTriState({ age: null }, expression)).toBe(
      'unknown'
    );
  });

  test('enforceCheckConstraints throws violations and allows unknown checks', () => {
    const table = {
      tableName: 'users',
      getChecks: () => [
        {
          name: 'age_positive',
          expression: gt(users.age, 0),
        },
      ],
    };

    expect(() => enforceCheckConstraints(table as any, { age: -1 })).toThrow(
      /violation/i
    );
    expect(() =>
      enforceCheckConstraints(table as any, { age: null })
    ).not.toThrow();
    expect(() =>
      enforceCheckConstraints(table as any, { age: 20 })
    ).not.toThrow();
  });

  test('toConvexFilter validates unary field-reference constraints', () => {
    const badUnary = {
      type: 'unary',
      operator: 'isNull',
      operands: [eq(users.name, 'Alice')],
      accept<R>(visitor: any): R {
        return visitor.visitUnary(this);
      },
    };

    expect(() => toConvexFilter(badUnary as any)).toThrow(
      /must operate on a field reference/i
    );
  });

  test('toConvexFilter inArray empty array compiles to never-match guard', () => {
    const filter = toConvexFilter({
      type: 'binary',
      operator: 'inArray',
      operands: [{ __brand: 'FieldReference', fieldName: 'status' }, []],
      accept<R>(visitor: any): R {
        return visitor.visitBinary(this as any);
      },
    } as any);

    const calls: { eq: unknown[][]; field: unknown[][] } = {
      eq: [],
      field: [],
    };
    const q = {
      eq: (a: unknown, b: unknown) => {
        calls.eq.push([a, b]);
        return { kind: 'eq', a, b };
      },
      field: (name: string) => {
        calls.field.push([name]);
        return { kind: 'field', name };
      },
    };

    expect(filter(q)).toEqual({
      kind: 'eq',
      a: { kind: 'field', name: '_id' },
      b: '__better_convex_never__',
    });
    expect(calls.field).toEqual([['_id']]);
    expect(calls.eq).toEqual([
      [{ kind: 'field', name: '_id' }, '__better_convex_never__'],
    ]);
  });

  test('takeRowsWithinByteBudget enforces limits and detects truncation', () => {
    expect(() => takeRowsWithinByteBudget([], 0)).toThrow(/positive integer/i);

    const rows = [
      { id: 1, payload: 'x'.repeat(20) },
      { id: 2, payload: 'x'.repeat(20) },
      { id: 3, payload: 'x'.repeat(20) },
    ];

    const firstOnly = takeRowsWithinByteBudget(rows as any, 120);
    expect(firstOnly.rows.length).toBe(1);
    expect(firstOnly.hitLimit).toBe(true);

    const allRows = takeRowsWithinByteBudget(rows as any, 10_000);
    expect(allRows.rows.length).toBe(3);
    expect(allRows.hitLimit).toBe(false);
  });

  test('getMutationCollectionLimits validates defaults', () => {
    const defaults = getMutationCollectionLimits(undefined);
    expect(defaults.batchSize).toBeGreaterThan(0);
    expect(defaults.maxRows).toBeGreaterThan(0);

    expect(() =>
      getMutationCollectionLimits({
        defaults: {
          mutationBatchSize: 0,
        },
      } as any)
    ).toThrow(/mutationBatchSize/i);
  });

  test('normalizeDateFieldsForWrite converts temporal fields and createdAt alias', () => {
    const birthday = new Date('2024-01-01T00:00:00.000Z');
    const startsAt = new Date('2024-01-12T10:11:12.000Z');

    const normalized = normalizeDateFieldsForWrite(users, {
      name: 'Alice',
      birthday,
      holiday: '2024-03-01',
      startsAt,
      loggedAt: '2024-03-03T11:12:13.000Z',
      createdAt: new Date('2024-02-01T00:00:00.000Z'),
    });

    expect(normalized).toMatchObject({
      name: 'Alice',
      birthday: '2024-01-01',
      holiday: '2024-03-01',
      startsAt: startsAt.getTime(),
      loggedAt: Date.parse('2024-03-03T11:12:13.000Z'),
    });
    expect(normalized).not.toHaveProperty('_creationTime');
    expect(normalized).not.toHaveProperty('createdAt');
  });

  test('normalizeDateFieldsForWrite rejects _creationTime', () => {
    expect(() =>
      normalizeDateFieldsForWrite(users, {
        _creationTime: 1_700_000_000_000,
      } as any)
    ).toThrow(/use `createdAt`/i);
  });

  test('normalizeDateFieldsForWrite reserves createdAt for system alias', () => {
    const normalized = normalizeDateFieldsForWrite(usersWithCreatedAt, {
      name: 'Alice',
      createdAt: 123,
    }) as any;

    expect(normalized).toMatchObject({
      name: 'Alice',
    });
    expect(normalized).not.toHaveProperty('_creationTime');
    expect(normalized).not.toHaveProperty('createdAt');
  });

  test('normalizeDateFieldsForWrite drops defaulted createdAt without writing _creationTime', () => {
    const withDefaults = applyDefaults(usersWithTimestampCreatedAt, {
      name: 'Alice',
    }) as { name: string; createdAt?: unknown };
    const normalized = normalizeDateFieldsForWrite(
      usersWithTimestampCreatedAt,
      withDefaults
    ) as any;

    expect(withDefaults.createdAt).toBeInstanceOf(Date);
    expect(normalized).toMatchObject({ name: 'Alice' });
    expect(normalized).not.toHaveProperty('createdAt');
    expect(normalized).not.toHaveProperty('_creationTime');
  });

  test('hydrateDateFieldsForRead maps temporal fields and keeps system createdAt as number', () => {
    const hydrated = hydrateDateFieldsForRead(users, {
      _id: 'u1',
      _creationTime: 1_700_000_000_000,
      birthday: '2024-01-01',
      holiday: '2024-02-01',
      startsAt: 1_600_000_000_000,
      loggedAt: 1_600_000_000_000,
    }) as any;

    expect(hydrated).toMatchObject({
      id: 'u1',
      createdAt: 1_700_000_000_000,
      holiday: '2024-02-01',
    });
    expect(hydrated).not.toHaveProperty('_id');
    expect(hydrated).not.toHaveProperty('_creationTime');
    expect(hydrated.birthday).toBeInstanceOf(Date);
    expect(hydrated.startsAt).toBeInstanceOf(Date);
    expect(typeof hydrated.loggedAt).toBe('string');
  });

  test('hydrateDateFieldsForRead reserves createdAt for system alias', () => {
    const hydrated = hydrateDateFieldsForRead(usersWithCreatedAt, {
      _id: 'u1',
      _creationTime: 1_700_000_000_000,
      name: 'Alice',
      createdAt: 123,
    }) as any;

    expect(hydrated).toMatchObject({
      id: 'u1',
      name: 'Alice',
      createdAt: 1_700_000_000_000,
    });
    expect(hydrated).not.toHaveProperty('_creationTime');
  });

  test('hydrateDateFieldsForRead backfills missing timestamp createdAt from _creationTime', () => {
    const hydrated = hydrateDateFieldsForRead(usersWithTimestampCreatedAt, {
      _id: 'u1',
      _creationTime: 1_700_000_000_000,
      name: 'Alice',
    }) as any;

    expect(hydrated).toMatchObject({
      id: 'u1',
      name: 'Alice',
    });
    expect(hydrated.createdAt).toBeInstanceOf(Date);
    expect(hydrated.createdAt.getTime()).toBe(1_700_000_000_000);
    expect(hydrated).not.toHaveProperty('_creationTime');
  });

  test('selectReturningRowWithHydration hydrates date-like selections', () => {
    const selected = selectReturningRowWithHydration(
      users,
      {
        _id: 'u1',
        _creationTime: 1_700_000_000_000,
        birthday: '2024-01-01',
        startsAt: 1_600_000_000_000,
      },
      {
        id: { columnName: '_id' },
        createdAt: { columnName: '_creationTime' },
        birthday: users.birthday,
        startsAt: users.startsAt,
      }
    ) as any;

    expect(selected.id).toBe('u1');
    expect(selected.createdAt).toBe(1_700_000_000_000);
    expect(selected.birthday).toBeInstanceOf(Date);
    expect(selected.startsAt).toBeInstanceOf(Date);
  });
});
