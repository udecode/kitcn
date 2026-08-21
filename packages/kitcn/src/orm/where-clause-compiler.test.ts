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

  test('plans isNull as an index range covering absent and null keys', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_deleted_at', indexFields: ['deletedAt'] },
    ]);

    const result = compiler.compile(
      isNull(fieldRef<number | null>('deletedAt') as any)
    ) as any;

    expect(result.strategy).toBe('rangeIndex');
    expect(result.selectedIndex?.indexName).toBe('by_deleted_at');
    // `<= null` spans the {undefined, null} prefix of Convex's value order, so
    // rows whose column was never written stay in the scan.
    expect(result.indexFilters).toHaveLength(1);
    expect(result.indexFilters[0].operator).toBe('lte');
    expect(result.indexFilters[0].operands[1]).toBeNull();
    // The expression is retained so over-fetched rows are re-verified.
    expect(result.postFilters).toHaveLength(1);
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

  test('plans an AND-nested inArray as an index union when nothing else is indexable', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
    ]);

    const result = compiler.compile(
      and(
        inArray(fieldRef<string>('status') as any, ['zmatch']),
        like(fieldRef<string>('name') as any, '%u%')
      )!
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_status');
    expect(result.probeFilters).toHaveLength(1);
    // The whole AND still has to be enforced after the probes.
    expect(result.postFilters).toHaveLength(1);
    expect((result.postFilters[0] as any).operator).toBe('and');
  });

  test('leaves an AND-nested inArray alone when an index was already selected', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_org', indexFields: ['orgId'] },
      { indexName: 'by_status', indexFields: ['status'] },
    ]);

    const result = compiler.compile(
      and(
        eq(fieldRef<string>('orgId') as any, 'o1'),
        inArray(fieldRef<string>('status') as any, ['a', 'b'])
      )!
    ) as any;

    expect(result.strategy).toBe('singleIndex');
    expect(result.selectedIndex?.indexName).toBe('by_org');
    expect(result.probeFilters).toHaveLength(0);
  });

  test('declines to promote a very wide AND-nested inArray', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
    ]);

    const wide = Array.from({ length: 200 }, (_, i) => `s${i}`);
    const result = compiler.compile(
      and(
        inArray(fieldRef<string>('status') as any, wide),
        like(fieldRef<string>('name') as any, '%u%')
      )!
    ) as any;

    expect(result.strategy).toBe('none');
    expect(result.selectedIndex).toBeNull();
  });

  test('prefers a compound index that also supplies the order', () => {
    const compiler = new WhereClauseCompiler('posts', [
      { indexName: 'by_org', indexFields: ['orgId'] },
      { indexName: 'by_org_created', indexFields: ['orgId', 'publishedAt'] },
    ]);

    const withOrder = compiler.compile(
      eq(fieldRef<string>('orgId') as any, 'o1'),
      { orderFields: ['publishedAt'] }
    ) as any;
    expect(withOrder.selectedIndex?.indexName).toBe('by_org_created');

    const withoutOrder = new WhereClauseCompiler('posts', [
      { indexName: 'by_org', indexFields: ['orgId'] },
      { indexName: 'by_org_created', indexFields: ['orgId', 'publishedAt'] },
    ]).compile(eq(fieldRef<string>('orgId') as any, 'o1')) as any;
    expect(withoutOrder.selectedIndex?.indexName).toBe('by_org');
  });

  test('keeps the narrow index when no candidate supplies the order', () => {
    const compiler = new WhereClauseCompiler('posts', [
      { indexName: 'by_org', indexFields: ['orgId'] },
      {
        indexName: 'by_tenant_created',
        indexFields: ['tenantId', 'publishedAt'],
      },
    ]);

    const result = compiler.compile(
      eq(fieldRef<string>('orgId') as any, 'o1'),
      { orderFields: ['publishedAt'] }
    ) as any;

    expect(result.selectedIndex?.indexName).toBe('by_org');
  });

  test('probe plans prefer an index whose second key is the order field', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
      { indexName: 'by_status_age', indexFields: ['status', 'age'] },
    ]);

    const result = compiler.compile(
      inArray(fieldRef<string>('status') as any, ['active', 'pending']),
      { orderFields: ['age'] }
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_status_age');
  });

  test('lands every unconsumed binary in postFilters exactly once', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_city', indexFields: ['city'] },
    ]);

    const terms = [eq(fieldRef<string>('city') as any, 'nyc')];
    for (let i = 0; i < 20; i += 1) {
      terms.push(eq(fieldRef<string>(`f${i}`) as any, `v${i}`));
    }

    const result = compiler.compile(and(...terms)!) as any;

    expect(result.strategy).toBe('singleIndex');
    expect(result.indexFilters).toHaveLength(1);
    expect(result.postFilters).toHaveLength(20);
    expect(new Set(result.postFilters).size).toBe(20);
  });

  test('keeps a second operator on an index field out of the index scan', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_age', indexFields: ['age'] },
    ]);

    const result = compiler.compile(
      and(
        eq(fieldRef<number>('age') as any, 30),
        ne(fieldRef<number>('age') as any, 31)
      )!
    ) as any;

    expect(result.indexFilters).toHaveLength(1);
    expect(result.postFilters).toHaveLength(1);
    expect((result.postFilters[0] as any).operator).toBe('ne');
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
    expect(specs).toEqual([
      { field: '_creationTime', direction: 'asc', nullable: false },
    ]);
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
    expect(specs).toEqual([
      { field: '_creationTime', direction: 'asc', nullable: false },
    ]);
  });

  test('still rejects _creationTime for migration', () => {
    const query = createQuery();
    expect(() =>
      (query as any)._orderBySpecs({ _creationTime: 'asc' })
    ).toThrow(/use `createdAt`/i);
  });
});
