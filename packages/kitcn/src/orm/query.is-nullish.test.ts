import {
  compileAggregateQueryPlan,
  compileCountQueryPlan,
  readCountFromBuckets,
  serializeCountKeyParts,
} from './aggregate-index/runtime';
import { integer } from './builders/number';
import { text } from './builders/text';
import { textEnum } from './builders/text-enum';
import { timestamp } from './builders/timestamp';
import { fieldRef, isNotNull, isNull } from './filter-expression';
import { aggregateIndex } from './indexes';
import { GelRelationalQuery } from './query';
import { OrmContext } from './symbols';
import { convexTable } from './table';

describe('GelRelationalQuery nullish filter compilation', () => {
  const users = convexTable('users_query_mode_test', {
    name: text().notNull(),
  });
  const usersWithCreatedAt = convexTable('users_query_mode_created_at_test', {
    name: text().notNull(),
    createdAt: text().notNull(),
  });
  const todos = convexTable(
    'todos_query_mode_created_at_test',
    {
      userId: text().notNull(),
      deletionTime: integer(),
      dueDate: integer(),
    },
    (t) => [
      aggregateIndex('metrics_by_user_deletion_time')
        .on(t.userId, t.deletionTime)
        .count(t.dueDate)
        .sum(t.dueDate),
    ]
  );
  const workflowRuns = convexTable(
    'workflow_runs_query_mode_test',
    {
      status: textEnum([
        'queued',
        'running',
        'completed',
        'failed',
        'canceled',
      ]).notNull(),
      updatedAt: timestamp({ mode: 'string' }).notNull(),
    },
    (t) => [
      aggregateIndex('all_runs_by_status_updated').on(t.status, t.updatedAt),
    ]
  );

  const createQuery = (table: any = users) =>
    new (GelRelationalQuery as any)(
      {},
      { table, name: table.tableName, relations: {} },
      [],
      { [OrmContext]: {} },
      {},
      'many'
    );

  const createBucketDb = (rows: Array<Record<string, unknown>>) => ({
    query() {
      return {
        withIndex(_name: string, apply: (q: any) => any) {
          const filters: Array<{
            field: string;
            operator: 'eq' | 'gte' | 'lt';
            value: unknown;
          }> = [];
          const query = {
            eq(field: string, value: unknown) {
              filters.push({ field, operator: 'eq', value });
              return query;
            },
            gte(field: string, value: unknown) {
              filters.push({ field, operator: 'gte', value });
              return query;
            },
            lt(field: string, value: unknown) {
              filters.push({ field, operator: 'lt', value });
              return query;
            },
            collect: async () =>
              rows.filter((row) =>
                filters.every((filter) => {
                  const rowValue = row[filter.field];
                  if (filter.operator === 'eq') {
                    return rowValue === filter.value;
                  }
                  if (filter.operator === 'gte') {
                    return rowValue >= filter.value;
                  }
                  return rowValue < filter.value;
                })
              ),
          };
          return apply(query);
        },
      };
    },
  });

  it('compiles isNull() to (field == null OR field == undefined)', () => {
    const expr = isNull(fieldRef<any>('deletedAt') as any) as any;

    const toConvex = (GelRelationalQuery.prototype as any)._toConvexExpression;
    const fn = toConvex.call({}, expr);

    const q = {
      field: (name: string) => ({ type: 'field', name }),
      eq: (l: unknown, r: unknown) => ({ type: 'eq', l, r }),
      or: (a: unknown, b: unknown) => ({ type: 'or', a, b }),
    };

    expect(fn(q)).toEqual({
      type: 'or',
      a: {
        type: 'eq',
        l: { type: 'field', name: 'deletedAt' },
        r: null,
      },
      b: {
        type: 'eq',
        l: { type: 'field', name: 'deletedAt' },
        r: undefined,
      },
    });
  });

  it('compiles isNotNull() to (field != null AND field != undefined)', () => {
    const expr = isNotNull(fieldRef<any>('deletedAt') as any) as any;

    const toConvex = (GelRelationalQuery.prototype as any)._toConvexExpression;
    const fn = toConvex.call({}, expr);

    const q = {
      field: (name: string) => ({ type: 'field', name }),
      neq: (l: unknown, r: unknown) => ({ type: 'neq', l, r }),
      and: (a: unknown, b: unknown) => ({ type: 'and', a, b }),
    };

    expect(fn(q)).toEqual({
      type: 'and',
      a: {
        type: 'neq',
        l: { type: 'field', name: 'deletedAt' },
        r: null,
      },
      b: {
        type: 'neq',
        l: { type: 'field', name: 'deletedAt' },
        r: undefined,
      },
    });
  });

  it('maps createdAt field name and rejects _creationTime', () => {
    const query = createQuery();

    expect((query as any)._normalizePublicFieldName('createdAt')).toBe(
      '_creationTime'
    );
    expect(() =>
      (query as any)._normalizePublicFieldName('_creationTime')
    ).toThrow(/use `createdAt`/i);
  });

  it('hydrates system createdAt as number by default', () => {
    const query = createQuery();

    const row = (query as any)._toPublicRow({
      _id: 'u1',
      _creationTime: 1_700_000_000_000,
      name: 'Alice',
    });

    expect(row).toMatchObject({
      id: 'u1',
      name: 'Alice',
    });
    expect(row).not.toHaveProperty('_creationTime');
    expect(row.createdAt).toBe(1_700_000_000_000);
  });

  it('reserves createdAt as system _creationTime even if a user column exists', () => {
    const query = createQuery(usersWithCreatedAt);

    expect((query as any)._normalizePublicFieldName('createdAt')).toBe(
      '_creationTime'
    );

    const row = (query as any)._toPublicRow({
      _id: 'u1',
      _creationTime: 1_700_000_000_000,
      createdAt: '2024-01-01T00:00:00.000Z',
      name: 'Alice',
    });

    expect(row).toMatchObject({
      id: 'u1',
      name: 'Alice',
      createdAt: 1_700_000_000_000,
    });
    expect(row).not.toHaveProperty('_creationTime');
  });

  it('still maps createdAt to system number alias', () => {
    const query = createQuery();

    const row = (query as any)._toPublicRow({
      _id: 'u1',
      _creationTime: 1_700_000_000_000,
      name: 'Alice',
    });

    expect(row).toMatchObject({
      id: 'u1',
      name: 'Alice',
      createdAt: 1_700_000_000_000,
    });
    expect(row).not.toHaveProperty('_creationTime');
  });

  it('allows cursor pagination ordering by _creationTime when a where index is used', async () => {
    const paginate = async () => ({
      page: [],
      continueCursor: null,
      isDone: true,
    });

    const queryBuilder: any = {
      withIndex: (_indexName: string, apply: (q: any) => any) => {
        apply({});
        return queryBuilder;
      },
      order: (_direction: 'asc' | 'desc') => queryBuilder,
      paginate,
    };

    const query = new (GelRelationalQuery as any)(
      {},
      { table: users, name: users.tableName, relations: {} },
      [],
      {
        query: (_tableName: string) => queryBuilder,
        [OrmContext]: {},
      },
      {
        cursor: null,
        limit: 10,
      },
      'many'
    );

    (query as any)._toConvexQuery = () => ({
      table: users.tableName,
      strategy: 'singleIndex',
      index: {
        name: 'by_name',
        filters: [],
      },
      probeFilters: [],
      postFilters: [],
      order: [{ field: '_creationTime', direction: 'desc' }],
    });

    await expect(query.execute()).resolves.toMatchObject({
      page: [],
      continueCursor: null,
      isDone: true,
    });
  });

  it('keeps count cursor bounds on public createdAt alias', () => {
    const query = createQuery();

    const config = (query as any)._coerceCountWindowConfig({
      cursor: { createdAt: 1_700_000_000_000 },
      orderBy: { createdAt: 'asc' },
    });

    expect(config.where).toEqual({
      createdAt: { gt: 1_700_000_000_000 },
    });
  });

  it('keeps aggregate cursor bounds on public createdAt alias', () => {
    const query = createQuery();

    const config = (query as any)._coerceAggregateWindowConfig({
      cursor: { createdAt: 1_700_000_000_000 },
      orderBy: { createdAt: 'asc' },
    });

    expect(config.where).toEqual({
      createdAt: { gt: 1_700_000_000_000 },
    });
  });

  it('compiles count range plans with createdAt cursor alias', () => {
    const plan = compileCountQueryPlan(
      { table: todos, name: todos.tableName, relations: {} },
      {
        AND: [
          { userId: 'u1', deletionTime: null },
          { createdAt: { gt: 1_700_000_000_000 } },
        ],
      }
    );

    expect(plan.indexName).toBe('metrics_by_user_deletion_time');
    expect(plan.rangeConstraint).toMatchObject({
      fieldName: '_creationTime',
      prefixFields: ['userId', 'deletionTime'],
    });
  });

  it('compiles aggregate range plans with createdAt cursor alias', () => {
    const plan = compileAggregateQueryPlan(
      { table: todos, name: todos.tableName, relations: {} },
      {
        AND: [
          { userId: 'u1', deletionTime: null },
          { createdAt: { gt: 1_700_000_000_000 } },
        ],
      },
      { kind: 'sum', field: 'dueDate' }
    );

    expect(plan.indexName).toBe('metrics_by_user_deletion_time');
    expect(plan.rangeConstraint).toMatchObject({
      fieldName: '_creationTime',
      prefixFields: ['userId', 'deletionTime'],
    });
  });

  it('normalizes string-mode timestamp ranges before reading aggregate buckets', async () => {
    const from = '2026-03-06T00:00:00.000Z';
    const to = '2026-04-06T00:00:00.000Z';
    const matchingUpdatedAt = Date.parse('2026-03-15T00:00:00.000Z');
    const plan = compileCountQueryPlan(
      { table: workflowRuns, name: workflowRuns.tableName, relations: {} },
      {
        status: 'completed',
        updatedAt: { gte: from, lte: to },
      }
    );
    const db = createBucketDb([
      {
        _id: 'bucket-1',
        tableKey: 'workflow_runs_query_mode_test',
        indexName: 'all_runs_by_status_updated',
        keyHash: serializeCountKeyParts(['completed', matchingUpdatedAt]),
        keyParts: ['completed', matchingUpdatedAt],
        count: 4,
        sumValues: {},
        nonNullCountValues: {},
      },
    ]);

    await expect(readCountFromBuckets(db as any, plan)).resolves.toBe(4);
    expect(plan.rangeConstraint?.comparisons).toEqual([
      { operator: 'gte', value: Date.parse(from) },
      { operator: 'lte', value: Date.parse(to) },
    ]);
  });
});
