export type AggregateParityStatus =
  | 'supported'
  | 'partial'
  | 'blocked'
  | 'missing';

export type AggregateParityId =
  | 'aggregate-core'
  | 'aggregate-sum-nullability'
  | 'groupby-core'
  | 'groupby-advanced-args'
  | 'groupby-window-order-required'
  | 'groupby-having-conjunction-only'
  | 'groupby-orderby-selected-metrics-only'
  | 'count-basic'
  | 'count-filtered'
  | 'count-select'
  | 'relation-count-unfiltered'
  | 'relation-count-filtered-direct'
  | 'aggregate-window-args'
  | 'aggregate-count-filter-subset'
  | 'relation-count-nested-filter'
  | 'distinct-query'
  | 'relation-count-through-filter'
  | 'mutation-return-count';

export type AggregateParityDefinition = {
  id: AggregateParityId;
  prismaFeature: string;
  status: AggregateParityStatus;
  reason: string;
  errorCode?: string;
  example: string;
  noScanBlocked?: boolean;
};

export const AGGREGATE_PARITY_DEFINITIONS: readonly AggregateParityDefinition[] =
  [
    {
      id: 'aggregate-core',
      prismaFeature: 'aggregate({ _count/_sum/_avg/_min/_max, where })',
      status: 'supported',
      reason: 'Runs from aggregate buckets only. No base-table scan fallback.',
      example:
        'db.query.todos.aggregate({ where, _count: { _all: true }, _sum: { dueDate: true } })',
    },
    {
      id: 'aggregate-sum-nullability',
      prismaFeature: 'aggregate({ _sum }) nullable semantics',
      status: 'supported',
      reason:
        '_sum returns null for empty/all-null sets (Prisma-compatible semantics).',
      example:
        "db.query.todos.aggregate({ where: { userId: 'missing' }, _sum: { dueDate: true } })",
    },
    {
      id: 'groupby-core',
      prismaFeature: 'groupBy({ by, where, _count/_sum/_avg/_min/_max })',
      status: 'supported',
      reason:
        'Supported when every by-field has finite eq/in/isNull constraints in where (no-scan, bounded groups).',
      example:
        "db.query.todos.groupBy({ by: ['userId'], where: { userId: { in: ['u1', 'u2'] } }, _count: true })",
    },
    {
      id: 'groupby-advanced-args',
      prismaFeature: 'groupBy({ having/orderBy/skip/take/cursor })',
      status: 'partial',
      reason:
        'Supported with strict no-scan constraints: conjunction-only having filters and finite index-bounded groups.',
      example:
        "db.query.todos.groupBy({ by: ['userId'], where: { userId: { in: ['u1', 'u2'] } }, _count: true, orderBy: [{ _count: 'desc' }], take: 10, cursor: { _count: 5, userId: 'u1' }, having: { _count: { gt: 0 } } })",
    },
    {
      id: 'groupby-window-order-required',
      prismaFeature: 'groupBy({ skip/take/cursor }) requires orderBy',
      status: 'blocked',
      reason: 'Windowed groupBy reads must include deterministic orderBy keys.',
      errorCode: 'AGGREGATE_ARGS_UNSUPPORTED',
      example:
        "db.query.todos.groupBy({ by: ['userId'], where: { userId: { in: ['u1'] } }, _count: true, skip: 10 })",
    },
    {
      id: 'groupby-having-conjunction-only',
      prismaFeature: 'groupBy({ having }) OR/NOT support',
      status: 'blocked',
      reason:
        'having supports conjunction-only predicates in v1 (OR/NOT blocked).',
      errorCode: 'AGGREGATE_FILTER_UNSUPPORTED',
      example:
        "db.query.todos.groupBy({ by: ['userId'], where: { userId: { in: ['u1'] } }, _count: true, having: { OR: [{ _count: { gt: 0 } }] } })",
      noScanBlocked: true,
    },
    {
      id: 'groupby-orderby-selected-metrics-only',
      prismaFeature: 'groupBy({ orderBy: aggregateMetric }) selected-only',
      status: 'blocked',
      reason:
        'orderBy aggregate metrics are allowed only when that metric field is selected.',
      errorCode: 'AGGREGATE_ARGS_UNSUPPORTED',
      example:
        "db.query.todos.groupBy({ by: ['userId'], where: { userId: { in: ['u1'] } }, _count: true, orderBy: [{ _sum: { dueDate: 'desc' } }] })",
    },
    {
      id: 'count-basic',
      prismaFeature: 'count()',
      status: 'supported',
      reason: 'Uses native Convex count syscall for unfiltered count.',
      example: 'db.query.todos.count()',
    },
    {
      id: 'count-filtered',
      prismaFeature: 'count({ where })',
      status: 'supported',
      reason:
        'Scalar eq/in/isNull/gt/gte/lt/lte + AND subset only, index-backed.',
      example:
        'db.query.todos.count({ where: { userId, deletionTime: { isNull: true } } })',
    },
    {
      id: 'count-select',
      prismaFeature: 'count({ where, select: { _all, field } })',
      status: 'supported',
      reason: 'Field counts require aggregateIndex.count(field) declarations.',
      example:
        'db.query.todos.count({ where, select: { _all: true, dueDate: true } })',
    },
    {
      id: 'relation-count-unfiltered',
      prismaFeature: 'findMany({ with: { _count: { relation: true } } })',
      status: 'supported',
      reason: 'Relation counts are index-backed and no-scan.',
      example: 'db.query.user.findMany({ with: { _count: { todos: true } } })',
    },
    {
      id: 'relation-count-filtered-direct',
      prismaFeature: 'findMany({ with: { _count: { relation: { where } } } })',
      status: 'supported',
      reason:
        'Direct relations support scalar eq/in/isNull/range + AND subset when indexed.',
      example:
        'db.query.user.findMany({ with: { _count: { todos: { where: { completed: true, deletionTime: { isNull: true } } } } } })',
    },
    {
      id: 'aggregate-window-args',
      prismaFeature: 'aggregate({ orderBy/take/skip/cursor })',
      status: 'partial',
      reason:
        'orderBy/cursor windowing is supported for aggregate metrics; skip/take remains _count-only because metric window skip/take is not bucket-computable under strict no-scan in v1.',
      example:
        "db.query.todos.aggregate({ _count: true, orderBy: { createdAt: 'desc' }, skip: 10, take: 25 })",
    },
    {
      id: 'aggregate-count-filter-subset',
      prismaFeature:
        'aggregate/count advanced filters (OR/NOT/string/relation)',
      status: 'partial',
      reason:
        'eq/in/isNull/gt/gte/lt/lte + AND are supported, with bounded finite DNF OR rewrite when branches resolve to one aggregateIndex. NOT/string/relation filters remain blocked.',
      example:
        'db.query.todos.aggregate({ where: { OR: [{ userId, completed: true }, { userId: otherUserId, completed: false }] }, _count: true })',
    },
    {
      id: 'relation-count-nested-filter',
      prismaFeature: 'relation _count nested relation filter',
      status: 'blocked',
      reason: 'Nested relation filters are blocked in relation _count v1.',
      errorCode: 'RELATION_COUNT_FILTER_UNSUPPORTED',
      example:
        "db.query.user.findMany({ with: { _count: { todos: { where: { project: { name: 'X' } } } } } })",
      noScanBlocked: true,
    },
    {
      id: 'distinct-query',
      prismaFeature: 'findMany({ distinct })',
      status: 'blocked',
      reason:
        'Not available on findMany to keep strict index-backed no-scan guarantees. Use select().distinct({ fields }) pipeline.',
      errorCode: 'DISTINCT_UNSUPPORTED',
      example:
        "db.query.todos.findMany({ where: { projectId }, distinct: ['status'] })",
      noScanBlocked: true,
    },
    {
      id: 'relation-count-through-filter',
      prismaFeature: 'relation _count filtered through() relation',
      status: 'supported',
      reason:
        'through() relation counts support scalar-filter subset with index-backed target filters.',
      example:
        'db.query.user.findMany({ with: { _count: { memberProjects: { where: { ownerId: userId } } } } })',
    },
    {
      id: 'mutation-return-count',
      prismaFeature: 'Prisma mutation return _count include/select parity',
      status: 'supported',
      reason:
        'Mutations support returning({ _count }) with relation and filtered relation counts (validated in integration tests; query demo cannot execute mutations directly).',
      example: 'db.update(...).returning({ _count: ... })',
    },
  ] as const;
