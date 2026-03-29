import { text } from './builders/text';
import {
  and,
  between,
  eq,
  fieldRef,
  inArray,
  isNotNull,
  isNull,
  like,
  ne,
  notBetween,
  notInArray,
  or,
  startsWith,
} from './filter-expression';
import { GelRelationalQuery } from './query';
import { OrmContext } from './symbols';
import { convexTable } from './table';
import { WhereClauseCompiler } from './where-clause-compiler';

describe('WhereClauseCompiler advanced index planning', () => {
  test('plans inArray as multi-probe index union', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
    ]);

    const result = compiler.compile(
      inArray(fieldRef<string>('status') as any, ['active', 'pending'])
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_status');
    expect(result.probeFilters).toHaveLength(2);
  });

  test('plans isNull as indexed equality to null', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_deleted_at', indexFields: ['deletedAt'] },
    ]);

    const result = compiler.compile(
      isNull(fieldRef<number | null>('deletedAt') as any)
    ) as any;

    expect(result.strategy).toBe('singleIndex');
    expect(result.selectedIndex?.indexName).toBe('by_deleted_at');
    expect(result.indexFilters).toHaveLength(1);
  });

  test('plans startsWith as index range', () => {
    const compiler = new WhereClauseCompiler('posts', [
      { indexName: 'by_title', indexFields: ['title'] },
    ]);

    const result = compiler.compile(
      startsWith(fieldRef<string>('title') as any, 'Java')
    ) as any;

    expect(result.strategy).toBe('rangeIndex');
    expect(result.selectedIndex?.indexName).toBe('by_title');
    expect(result.indexFilters).toHaveLength(2);
  });

  test("plans like('prefix%') as index range", () => {
    const compiler = new WhereClauseCompiler('posts', [
      { indexName: 'by_title', indexFields: ['title'] },
    ]);

    const result = compiler.compile(
      like(fieldRef<string>('title') as any, 'Java%')
    ) as any;

    expect(result.strategy).toBe('rangeIndex');
    expect(result.selectedIndex?.indexName).toBe('by_title');
    expect(result.indexFilters).toHaveLength(2);
  });

  test('plans between as index range', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_age', indexFields: ['age'] },
    ]);

    const result = compiler.compile(
      between(fieldRef<number>('age') as any, 18, 65)
    ) as any;

    expect(result.strategy).toBe('rangeIndex');
    expect(result.selectedIndex?.indexName).toBe('by_age');
    expect(result.indexFilters).toHaveLength(2);
    expect(result.indexFilters[0].operator).toBe('gte');
    expect(result.indexFilters[1].operator).toBe('lte');
  });

  test('plans notBetween as multi-probe complement ranges', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_age', indexFields: ['age'] },
    ]);

    const result = compiler.compile(
      notBetween(fieldRef<number>('age') as any, 18, 65)
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_age');
    expect(result.probeFilters).toHaveLength(2);
    expect(result.probeFilters[0][0].operator).toBe('lt');
    expect(result.probeFilters[1][0].operator).toBe('gt');
  });

  test('plans OR eq branches on same field as multi-probe', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
    ]);

    const expression = or(
      eq(fieldRef<string>('status') as any, 'active'),
      eq(fieldRef<string>('status') as any, 'pending')
    )!;
    const result = compiler.compile(expression) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_status');
    expect(result.probeFilters).toHaveLength(2);
  });

  test('keeps mixed OR as non-index compiled', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
      { indexName: 'by_age', indexFields: ['age'] },
    ]);

    const expression = or(
      eq(fieldRef<string>('status') as any, 'active'),
      startsWith(fieldRef<string>('name') as any, 'A')
    )!;
    const result = compiler.compile(expression) as any;

    expect(result.strategy).toBe('none');
    expect(result.selectedIndex).toBeNull();
    expect(result.postFilters).toHaveLength(1);
  });

  test('plans ne as multi-probe complement ranges', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
    ]);

    const result = compiler.compile(
      ne(fieldRef<string>('status') as any, 'deleted')
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_status');
    expect(result.probeFilters).toHaveLength(2);
  });

  test('plans notInArray as multi-probe complement ranges', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
    ]);

    const result = compiler.compile(
      notInArray(fieldRef<string>('status') as any, ['deleted', 'pending'])
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_status');
    expect(result.probeFilters.length).toBeGreaterThanOrEqual(1);
  });

  test('plans isNotNull as multi-probe complement of null', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_deleted_at', indexFields: ['deletedAt'] },
    ]);

    const result = compiler.compile(
      isNotNull(fieldRef<number | null>('deletedAt') as any)
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_deleted_at');
    expect(result.probeFilters).toHaveLength(2);
  });

  test('keeps ne/notInArray/isNotNull non-indexed when no usable index exists', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_email', indexFields: ['email'] },
    ]);

    expect(
      compiler.compile(ne(fieldRef<string>('status') as any, 'deleted'))
        .strategy
    ).toBe('none');
    expect(
      compiler.compile(
        notInArray(fieldRef<string>('status') as any, ['deleted'])
      ).strategy
    ).toBe('none');
    expect(
      compiler.compile(isNotNull(fieldRef<number | null>('deletedAt') as any))
        .strategy
    ).toBe('none');
    expect(
      compiler.compile(between(fieldRef<number>('age') as any, 18, 65)).strategy
    ).toBe('none');
    expect(
      compiler.compile(notBetween(fieldRef<number>('age') as any, 18, 65))
        .strategy
    ).toBe('none');
  });

  test('does not push non-leading compound field into index filters', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_city_status', indexFields: ['city', 'status'] },
    ]);

    const result = compiler.compile(
      eq(fieldRef<string>('status') as any, 'active')
    ) as any;

    expect(result.strategy).toBe('none');
    expect(result.indexFilters).toHaveLength(0);
    expect(result.postFilters).toHaveLength(1);
  });

  test('orders index eq filters by compound index field order', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_city_status', indexFields: ['city', 'status'] },
    ]);

    const result = compiler.compile(
      and(
        eq(fieldRef<string>('status') as any, 'active'),
        eq(fieldRef<string>('city') as any, 'nyc')
      )!
    ) as any;

    expect(result.strategy).toBe('singleIndex');
    expect(
      result.indexFilters.map((filter: any) => filter.operands[0].fieldName)
    ).toEqual(['city', 'status']);
    expect(result.postFilters).toHaveLength(0);
  });
});

describe('timestamp mode key normalization', () => {
  const users = convexTable('users_where_mode_test', {
    name: text().notNull(),
  });
  const usersWithCreatedAt = convexTable('users_where_mode_created_at_test', {
    name: text().notNull(),
    createdAt: text().notNull(),
  });

  const createQuery = (table: any = users) =>
    new (GelRelationalQuery as any)(
      {},
      { table, name: table.tableName, relations: {} },
      [],
      { [OrmContext]: {} },
      {},
      'many'
    );

  test('accepts createdAt in orderBy object', () => {
    const query = createQuery();
    const specs = (query as any)._orderBySpecs({ createdAt: 'asc' });
    expect(specs).toEqual([{ field: '_creationTime', direction: 'asc' }]);
  });

  test('rejects _creationTime in orderBy object', () => {
    const query = createQuery();
    expect(() =>
      (query as any)._orderBySpecs({ _creationTime: 'asc' })
    ).toThrow(/use `createdAt`/i);
  });

  test('always maps createdAt to system _creationTime even if a user column exists', () => {
    const query = createQuery(usersWithCreatedAt);
    const specs = (query as any)._orderBySpecs({ createdAt: 'asc' });
    expect(specs).toEqual([{ field: '_creationTime', direction: 'asc' }]);
  });

  test('still rejects _creationTime for migration', () => {
    const query = createQuery();
    expect(() =>
      (query as any)._orderBySpecs({ _creationTime: 'asc' })
    ).toThrow(/use `createdAt`/i);
  });
});
