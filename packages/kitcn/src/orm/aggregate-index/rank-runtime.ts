import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from 'convex/server';
import type { GenericId } from 'convex/values';
import { DirectAggregate } from '../../aggregate-core/runtime';
import type { TableRelationalConfig } from '../types';
import {
  AGGREGATE_STATE_KIND_RANK,
  COUNT_STATUS_READY,
  getCountState,
} from './runtime';
import { AGGREGATE_MEMBER_TABLE } from './schema';

type RankWhere = Record<string, unknown>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const stableEquals = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

type RankOrderField = {
  field: string;
  direction: 'asc' | 'desc';
};

export type RankIndexDefinition = {
  name: string;
  partitionFields: string[];
  orderFields: RankOrderField[];
  sumField?: string;
};

export type RankQueryPlan = {
  tableName: string;
  indexName: string;
  definition: RankIndexDefinition;
  namespace: unknown;
};

type RankMemberRow = {
  _id: string;
  kind: string;
  tableKey: string;
  indexName: string;
  docId: string;
  rankNamespace?: unknown;
  rankKey?: unknown;
  rankSumValue?: number;
};

const RANK_MEMBER_KIND = AGGREGATE_STATE_KIND_RANK;

export const RANK_ERROR = {
  FILTER_UNSUPPORTED: 'RANK_FILTER_UNSUPPORTED',
  NOT_INDEXED: 'RANK_NOT_INDEXED',
  INDEX_BUILDING: 'RANK_INDEX_BUILDING',
  RLS_UNSUPPORTED: 'RANK_RLS_UNSUPPORTED',
} as const;

const createRankError = (code: string, message: string): Error =>
  new Error(`${code}: ${message}`);

const rankAggregateName = (tableName: string, indexName: string): string =>
  `${tableName}.${indexName}`;

const rankAggregate = (tableName: string, indexName: string) =>
  new DirectAggregate<any>({
    name: rankAggregateName(tableName, indexName),
  });

const toRankValue = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw createRankError(
    RANK_ERROR.FILTER_UNSUPPORTED,
    `rankIndex order field values must be finite numbers or dates; received '${typeof value}'.`
  );
};

const decodeRankValue = (
  value: unknown,
  direction: 'asc' | 'desc'
): unknown => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return direction === 'desc' ? -value : value;
  }
  return value;
};

const getRankSortKey = (
  definition: RankIndexDefinition,
  doc: Record<string, unknown>,
  docId: string
): unknown[] => {
  const key: unknown[] = [];
  for (const orderField of definition.orderFields) {
    const rawValue = toRankValue(doc[orderField.field]);
    if (rawValue === null) {
      key.push(null);
      continue;
    }
    key.push(orderField.direction === 'desc' ? -rawValue : rawValue);
  }
  key.push(docId);
  return key;
};

const toPublicRankKey = (
  definition: RankIndexDefinition,
  key: unknown
): unknown => {
  if (!Array.isArray(key)) {
    return key;
  }
  const withoutTieBreaker = key.slice(0, definition.orderFields.length);
  const restored = withoutTieBreaker.map((value, index) =>
    decodeRankValue(value, definition.orderFields[index]!.direction)
  );
  return restored.length === 1 ? restored[0] : restored;
};

const getRankSumValue = (
  definition: RankIndexDefinition,
  doc: Record<string, unknown>
): number => {
  if (!definition.sumField) {
    return 1;
  }
  const raw = doc[definition.sumField];
  if (raw === null || raw === undefined) {
    return 0;
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw createRankError(
      RANK_ERROR.FILTER_UNSUPPORTED,
      `rankIndex '${definition.name}' sum field '${definition.sumField}' must be a finite number.`
    );
  }
  return raw;
};

const validateRankWhereValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return null;
  }
  if (isObject(value)) {
    if (Object.hasOwn(value, 'eq')) {
      return (value as any).eq ?? null;
    }
    if ((value as any).isNull === true) {
      return null;
    }
    throw createRankError(
      RANK_ERROR.FILTER_UNSUPPORTED,
      'rank() where supports only eq and isNull: true on partition fields.'
    );
  }
  if (Array.isArray(value)) {
    throw createRankError(
      RANK_ERROR.FILTER_UNSUPPORTED,
      'rank() where does not support IN arrays in v1.'
    );
  }
  return value;
};

const collectWhere = (
  where: RankWhere,
  fields: Set<string>,
  out: Map<string, unknown>
): void => {
  if (Object.hasOwn(where, 'OR') || Object.hasOwn(where, 'NOT')) {
    throw createRankError(
      RANK_ERROR.FILTER_UNSUPPORTED,
      'rank() where supports conjunctions only (object fields + AND).'
    );
  }
  if (Object.hasOwn(where, 'RAW')) {
    throw createRankError(
      RANK_ERROR.FILTER_UNSUPPORTED,
      'rank() where does not support RAW filters.'
    );
  }
  const andEntries = where.AND;
  if (andEntries !== undefined) {
    if (!Array.isArray(andEntries)) {
      throw createRankError(
        RANK_ERROR.FILTER_UNSUPPORTED,
        'rank() where AND must be an array.'
      );
    }
    for (const entry of andEntries) {
      if (!isObject(entry)) {
        throw createRankError(
          RANK_ERROR.FILTER_UNSUPPORTED,
          'rank() where AND entries must be objects.'
        );
      }
      collectWhere(entry, fields, out);
    }
  }

  for (const [field, rawValue] of Object.entries(where)) {
    if (field === 'AND') {
      continue;
    }
    if (!fields.has(field)) {
      throw createRankError(
        RANK_ERROR.FILTER_UNSUPPORTED,
        `rank() where field '${field}' is not a partition field.`
      );
    }
    const nextValue = validateRankWhereValue(rawValue);
    const prevValue = out.get(field);
    if (prevValue !== undefined && !stableEquals(prevValue, nextValue)) {
      throw createRankError(
        RANK_ERROR.FILTER_UNSUPPORTED,
        `rank() where has conflicting constraints for '${field}'.`
      );
    }
    out.set(field, nextValue);
  }
};

const buildNamespace = (
  definition: RankIndexDefinition,
  values: Map<string, unknown>
): unknown => {
  if (definition.partitionFields.length === 0) {
    return undefined;
  }
  const parts = definition.partitionFields.map((field) => values.get(field));
  return parts.length === 1 ? parts[0] : parts;
};

export const getRankIndexDefinitions = (
  tableConfig: TableRelationalConfig
): RankIndexDefinition[] => {
  const rankIndexes = (tableConfig.table as any).getRankIndexes?.();
  if (!Array.isArray(rankIndexes)) {
    return [];
  }
  return rankIndexes.map((entry) => ({
    name: entry.name,
    partitionFields: entry.partitionFields ?? [],
    orderFields: entry.orderFields ?? [],
    sumField: entry.sumField,
  }));
};

export const ensureRankAllowedForRls = (
  tableConfig: TableRelationalConfig,
  rlsMode: 'skip' | 'enforce' | undefined
): void => {
  const enabled =
    typeof (tableConfig.table as any).isRlsEnabled === 'function'
      ? (tableConfig.table as any).isRlsEnabled()
      : false;
  if (enabled && rlsMode !== 'skip') {
    throw createRankError(
      RANK_ERROR.RLS_UNSUPPORTED,
      `rank() is not available for table '${tableConfig.name}' in RLS-restricted contexts in v1.`
    );
  }
};

export const compileRankPlan = (
  tableConfig: TableRelationalConfig,
  indexName: string,
  where: unknown
): RankQueryPlan => {
  const definition = getRankIndexDefinitions(tableConfig).find(
    (entry) => entry.name === indexName
  );
  if (!definition) {
    throw createRankError(
      RANK_ERROR.NOT_INDEXED,
      `No rankIndex '${indexName}' found on '${tableConfig.name}'. Declare rankIndex('${indexName}') and run aggregateBackfill.`
    );
  }

  if (!isObject(where ?? {})) {
    throw createRankError(
      RANK_ERROR.FILTER_UNSUPPORTED,
      'rank() where must be an object filter.'
    );
  }

  const values = new Map<string, unknown>();
  const whereObject = (where ?? {}) as RankWhere;
  collectWhere(whereObject, new Set(definition.partitionFields), values);

  for (const field of definition.partitionFields) {
    if (!values.has(field)) {
      throw createRankError(
        RANK_ERROR.NOT_INDEXED,
        `rank() on '${tableConfig.name}.${indexName}' requires all partition fields constrained: [${definition.partitionFields.join(', ')}].`
      );
    }
  }

  return {
    tableName: tableConfig.name,
    indexName,
    definition,
    namespace: buildNamespace(definition, values),
  };
};

export const ensureRankIndexReady = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string
): Promise<void> => {
  const state = await getCountState(
    db,
    tableName,
    indexName,
    AGGREGATE_STATE_KIND_RANK
  );
  if (!state || state.status !== COUNT_STATUS_READY) {
    throw createRankError(
      RANK_ERROR.INDEX_BUILDING,
      `rankIndex '${tableName}.${indexName}' is BUILDING. Run aggregateBackfill until READY.`
    );
  }
};

const getRankMemberByDoc = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  docId: string
): Promise<RankMemberRow | null> => {
  const rows = (await db
    .query(AGGREGATE_MEMBER_TABLE)
    .withIndex('by_kind_table_index_doc', (q: any) =>
      q
        .eq('kind', RANK_MEMBER_KIND)
        .eq('tableKey', tableName)
        .eq('indexName', indexName)
        .eq('docId', docId)
    )
    .collect()) as RankMemberRow[];
  return rows[0] ?? null;
};

const listRankMembers = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string
): Promise<RankMemberRow[]> =>
  (await db
    .query(AGGREGATE_MEMBER_TABLE)
    .withIndex('by_kind_table_index', (q: any) =>
      q
        .eq('kind', RANK_MEMBER_KIND)
        .eq('tableKey', tableName)
        .eq('indexName', indexName)
    )
    .collect()) as RankMemberRow[];

const rankCtx = (db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>) =>
  ({ db, orm: undefined }) as any;

export const clearRankIndexData = async (
  db: GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string
): Promise<void> => {
  const aggregate = rankAggregate(tableName, indexName);
  await aggregate.clearAll(rankCtx(db));
  const members = await listRankMembers(db, tableName, indexName);
  for (const member of members) {
    await db.delete(AGGREGATE_MEMBER_TABLE, member._id as any);
  }
};

export const reconcileRankMembership = async (
  db: GenericDatabaseWriter<any>,
  params: {
    tableName: string;
    definition: RankIndexDefinition;
    docId: string;
    doc: Record<string, unknown> | null;
  }
): Promise<void> => {
  const { tableName, definition, docId, doc } = params;
  const existing = await getRankMemberByDoc(
    db,
    tableName,
    definition.name,
    docId
  );
  const aggregate = rankAggregate(tableName, definition.name);
  const ctx = rankCtx(db);
  const now = Date.now();

  if (!doc) {
    if (existing?.rankKey !== undefined) {
      await aggregate.delete(ctx, {
        id: docId,
        key: existing.rankKey as any,
        namespace: existing.rankNamespace as any,
      });
      await db.delete(AGGREGATE_MEMBER_TABLE, existing._id as any);
    }
    return;
  }

  const namespace = buildNamespace(
    definition,
    new Map(
      definition.partitionFields.map((field) => [field, doc[field]] as const)
    )
  );
  const key = getRankSortKey(definition, doc, docId);
  const sumValue = getRankSumValue(definition, doc);

  if (
    existing &&
    stableEquals(existing.rankNamespace, namespace) &&
    stableEquals(existing.rankKey, key) &&
    (existing.rankSumValue ?? 0) === sumValue
  ) {
    await db.patch(AGGREGATE_MEMBER_TABLE, existing._id as any, {
      updatedAt: now,
    });
    return;
  }

  if (existing?.rankKey !== undefined) {
    await aggregate.replace(
      ctx,
      {
        id: docId,
        key: existing.rankKey as any,
        namespace: existing.rankNamespace as any,
      },
      {
        key: key as any,
        namespace: namespace as any,
        sumValue,
      }
    );
    await db.patch(AGGREGATE_MEMBER_TABLE, existing._id as any, {
      kind: RANK_MEMBER_KIND,
      keyHash: '__rank__',
      keyParts: [],
      sumValues: {},
      nonNullCountValues: {},
      extremaValues: {},
      rankNamespace: namespace,
      rankKey: key,
      rankSumValue: sumValue,
      updatedAt: now,
    });
    return;
  }

  await aggregate.insert(ctx, {
    id: docId,
    key: key as any,
    namespace: namespace as any,
    sumValue,
  });
  await db.insert(AGGREGATE_MEMBER_TABLE, {
    kind: RANK_MEMBER_KIND,
    tableKey: tableName,
    indexName: definition.name,
    docId,
    keyHash: '__rank__',
    keyParts: [],
    sumValues: {},
    nonNullCountValues: {},
    extremaValues: {},
    rankNamespace: namespace,
    rankKey: key,
    rankSumValue: sumValue,
    updatedAt: now,
  } as any);
};

export const applyRankIndexesForChange = async (
  db: GenericDatabaseWriter<any>,
  tableName: string,
  rankIndexes: RankIndexDefinition[],
  change:
    | {
        operation: 'insert';
        id: GenericId<any> | string;
        newDoc: Record<string, unknown>;
      }
    | {
        operation: 'update';
        id: GenericId<any> | string;
        newDoc: Record<string, unknown>;
      }
    | {
        operation: 'delete';
        id: GenericId<any> | string;
      }
): Promise<void> => {
  const docId = String(change.id);
  for (const rankIndex of rankIndexes) {
    await reconcileRankMembership(db, {
      tableName,
      definition: rankIndex,
      docId,
      doc: change.operation === 'delete' ? null : change.newDoc,
    });
  }
};

export const readRankCount = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: RankQueryPlan
): Promise<number> => {
  const aggregate = rankAggregate(plan.tableName, plan.indexName);
  return await aggregate.count(rankCtx(db), {
    namespace: plan.namespace as any,
  });
};

export const readRankSum = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: RankQueryPlan
): Promise<number> => {
  const aggregate = rankAggregate(plan.tableName, plan.indexName);
  return await aggregate.sum(rankCtx(db), {
    namespace: plan.namespace as any,
  });
};

const toPublicRankItem = (
  plan: RankQueryPlan,
  item: { id: string; key: unknown; sumValue: number }
): { id: string; key: unknown; sumValue: number } => ({
  id: item.id,
  key: toPublicRankKey(plan.definition, item.key),
  sumValue: item.sumValue,
});

export const readRankAt = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: RankQueryPlan,
  offset: number
): Promise<{ id: string; key: unknown; sumValue: number } | null> => {
  const aggregate = rankAggregate(plan.tableName, plan.indexName);
  const count = await aggregate.count(rankCtx(db), {
    namespace: plan.namespace as any,
  });
  if (count <= 0) {
    return null;
  }
  const normalizedOffset = offset < 0 ? count + offset : offset;
  if (normalizedOffset < 0 || normalizedOffset >= count) {
    return null;
  }
  const item = await aggregate.at(rankCtx(db), offset, {
    namespace: plan.namespace as any,
  });
  return toPublicRankItem(plan, item as any);
};

export const readRankIndexOf = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: RankQueryPlan,
  args: { id: string }
): Promise<number> => {
  const member = await getRankMemberByDoc(
    db,
    plan.tableName,
    plan.indexName,
    args.id
  );
  if (!member || member.rankKey === undefined) {
    return -1;
  }
  if (!stableEquals(member.rankNamespace, plan.namespace)) {
    return -1;
  }

  const aggregate = rankAggregate(plan.tableName, plan.indexName);
  return await aggregate.indexOf(rankCtx(db), member.rankKey as any, {
    namespace: plan.namespace as any,
    id: args.id as any,
  });
};

export const readRankPaginate = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: RankQueryPlan,
  cursor: string | null | undefined,
  limit: number
): Promise<{
  continueCursor: string;
  isDone: boolean;
  page: Array<{ id: string; key: unknown; sumValue: number }>;
}> => {
  const aggregate = rankAggregate(plan.tableName, plan.indexName);
  const paged = await aggregate.paginate(rankCtx(db), {
    namespace: plan.namespace as any,
    cursor: cursor ?? undefined,
    pageSize: limit,
  });
  return {
    continueCursor: paged.cursor ?? '',
    isDone: paged.isDone,
    page: paged.page.map((item) => toPublicRankItem(plan, item as any)),
  };
};

export const readRankMin = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: RankQueryPlan
): Promise<{ id: string; key: unknown; sumValue: number } | null> =>
  await readRankAt(db, plan, 0);

export const readRankMax = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: RankQueryPlan
): Promise<{ id: string; key: unknown; sumValue: number } | null> =>
  await readRankAt(db, plan, -1);

export const readRankRandom = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: RankQueryPlan
): Promise<{ id: string; key: unknown; sumValue: number } | null> => {
  const count = await readRankCount(db, plan);
  if (count <= 0) {
    return null;
  }
  const offset = Math.floor(Math.random() * count);
  return await readRankAt(db, plan, offset);
};
