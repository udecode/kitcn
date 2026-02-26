import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  SchedulableFunctionReference,
  Scheduler,
} from 'convex/server';
import type { TablesRelationalConfig } from '../relations';
import {
  clearRankIndexData,
  getRankIndexDefinitions,
  reconcileRankMembership,
} from './rank-runtime';
import {
  AGGREGATE_STATE_KIND_METRIC,
  AGGREGATE_STATE_KIND_RANK,
  COUNT_STATUS_BUILDING,
  COUNT_STATUS_READY,
  clearCountIndexData,
  computeAggregateMetricValues,
  computeCountKeyParts,
  getCountState,
  listSchemaAggregateIndexes,
  reconcileAggregateMembership,
  setCountState,
  setCountStateError,
} from './runtime';
import {
  AGGREGATE_BUCKET_TABLE,
  AGGREGATE_EXTREMA_TABLE,
  AGGREGATE_MEMBER_TABLE,
  AGGREGATE_STATE_TABLE,
} from './schema';

export type CountBackfillMode = 'resume' | 'rebuild' | 'prune';

export type CountBackfillKickoffArgs = {
  tableName?: string;
  indexName?: string;
  batchSize?: number;
  mode?: CountBackfillMode;
};

export type CountBackfillChunkArgs = {
  tableName?: string;
  indexName?: string;
  batchSize?: number;
};

export type CountBackfillStatusArgs = {
  tableName?: string;
  indexName?: string;
};

type CountBackfillTarget = {
  kind: 'metric' | 'rank';
  tableName: string;
  indexName: string;
  fields: string[];
  countFields?: string[];
  sumFields?: string[];
  avgFields?: string[];
  minFields?: string[];
  maxFields?: string[];
  orderFields?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  rankSumField?: string;
};

type CountBackfillContext = {
  db: GenericDatabaseWriter<any>;
  scheduler?: Scheduler;
};

type MetricDefinition = {
  countFields: string[];
  sumFields: string[];
  avgFields: string[];
  minFields: string[];
  maxFields: string[];
};

type MetricStorageDefinition = {
  sumFields: Set<string>;
  nonNullCountFields: Set<string>;
  extremaFields: Set<string>;
};

const DEFAULT_BACKFILL_BATCH_SIZE = 1000;

const getBackfillMode = (candidate: unknown): CountBackfillMode => {
  if (candidate === undefined) {
    return 'resume';
  }
  if (
    candidate === 'resume' ||
    candidate === 'rebuild' ||
    candidate === 'prune'
  ) {
    return candidate;
  }
  throw new Error(
    "countBackfill mode must be one of 'resume', 'rebuild', or 'prune'."
  );
};

const getBackfillBatchSize = (candidate: unknown): number => {
  if (candidate === undefined) {
    return DEFAULT_BACKFILL_BATCH_SIZE;
  }
  if (typeof candidate !== 'number' || !Number.isInteger(candidate)) {
    throw new Error('countBackfill batchSize must be a positive integer.');
  }
  if (candidate < 1) {
    throw new Error('countBackfill batchSize must be a positive integer.');
  }
  return candidate;
};

const matchesFilter = (
  target: CountBackfillTarget,
  args: { tableName?: string; indexName?: string }
): boolean => {
  if (args.tableName && target.tableName !== args.tableName) {
    return false;
  }
  if (args.indexName && target.indexName !== args.indexName) {
    return false;
  }
  return true;
};

const getTargets = (
  schema: TablesRelationalConfig,
  args: { tableName?: string; indexName?: string }
): CountBackfillTarget[] => {
  const metricTargets = listSchemaAggregateIndexes(schema).map((entry) => ({
    kind: 'metric' as const,
    tableName: entry.tableName,
    indexName: entry.indexName,
    fields: entry.fields,
    countFields: entry.countFields,
    sumFields: entry.sumFields,
    avgFields: entry.avgFields,
    minFields: entry.minFields,
    maxFields: entry.maxFields,
  }));

  const rankTargets: CountBackfillTarget[] = [];
  for (const tableConfig of Object.values(schema)) {
    const rankIndexes = getRankIndexDefinitions(tableConfig);
    for (const rankIndex of rankIndexes) {
      rankTargets.push({
        kind: 'rank',
        tableName: tableConfig.name,
        indexName: rankIndex.name,
        fields: rankIndex.partitionFields,
        orderFields: rankIndex.orderFields,
        rankSumField: rankIndex.sumField,
      });
    }
  }

  return [...metricTargets, ...rankTargets].filter((entry) =>
    matchesFilter(entry, args)
  );
};

const dedupe = (fields: string[]): string[] => [...new Set(fields)];

const computeMetricDefinition = (
  target: CountBackfillTarget
): MetricDefinition => ({
  countFields: dedupe(target.countFields ?? []),
  sumFields: dedupe(target.sumFields ?? []),
  avgFields: dedupe(target.avgFields ?? []),
  minFields: dedupe(target.minFields ?? []),
  maxFields: dedupe(target.maxFields ?? []),
});

const computeKeyDefinitionHash = (target: CountBackfillTarget): string =>
  JSON.stringify({
    kind: target.kind,
    fields: target.fields,
    orderFields: target.orderFields ?? [],
  });

const computeMetricDefinitionHash = (target: CountBackfillTarget): string =>
  target.kind === 'rank'
    ? JSON.stringify({
        sumField: target.rankSumField ?? null,
      })
    : JSON.stringify(computeMetricDefinition(target));

const parseMetricDefinitionHash = (
  metricDefinitionHash: string
): MetricDefinition => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metricDefinitionHash);
  } catch {
    throw new Error(
      `Invalid metricDefinitionHash payload: ${metricDefinitionHash}`
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid metricDefinitionHash payload shape.');
  }

  const pick = (key: keyof MetricDefinition): string[] => {
    const candidate = (parsed as Record<string, unknown>)[key];
    if (!Array.isArray(candidate)) {
      throw new Error(`metricDefinitionHash is missing '${key}'.`);
    }
    if (candidate.some((entry) => typeof entry !== 'string')) {
      throw new Error(`metricDefinitionHash has non-string value in '${key}'.`);
    }
    return dedupe(candidate as string[]);
  };

  return {
    countFields: pick('countFields'),
    sumFields: pick('sumFields'),
    avgFields: pick('avgFields'),
    minFields: pick('minFields'),
    maxFields: pick('maxFields'),
  };
};

const toMetricStorageDefinition = (
  metricDefinition: MetricDefinition
): MetricStorageDefinition => ({
  sumFields: new Set([
    ...metricDefinition.sumFields,
    ...metricDefinition.avgFields,
  ]),
  nonNullCountFields: new Set([
    ...metricDefinition.countFields,
    ...metricDefinition.avgFields,
  ]),
  extremaFields: new Set([
    ...metricDefinition.minFields,
    ...metricDefinition.maxFields,
  ]),
});

const requiresMetricBackfill = (
  existingMetricDefinitionHash: string,
  targetMetricDefinitionHash: string
): boolean => {
  const existingDefinition = parseMetricDefinitionHash(
    existingMetricDefinitionHash
  );
  const targetDefinition = parseMetricDefinitionHash(
    targetMetricDefinitionHash
  );

  const existingStorage = toMetricStorageDefinition(existingDefinition);
  const targetStorage = toMetricStorageDefinition(targetDefinition);
  const hasMissing = (target: Set<string>, existing: Set<string>): boolean => {
    for (const field of target) {
      if (!existing.has(field)) {
        return true;
      }
    }
    return false;
  };

  return (
    hasMissing(targetStorage.sumFields, existingStorage.sumFields) ||
    hasMissing(
      targetStorage.nonNullCountFields,
      existingStorage.nonNullCountFields
    ) ||
    hasMissing(targetStorage.extremaFields, existingStorage.extremaFields)
  );
};

export function createCountBackfillHandlers(
  schema: TablesRelationalConfig,
  getChunkRef?: () => SchedulableFunctionReference | undefined
) {
  const serializeKey = (
    kind: 'metric' | 'rank',
    tableName: string,
    indexName: string
  ): string => `${kind}\u0000${tableName}\u0000${indexName}`;

  const pruneRemovedState = async (
    ctx: CountBackfillContext,
    args: CountBackfillKickoffArgs,
    targets: CountBackfillTarget[]
  ): Promise<number> => {
    const targetKeys = new Set(
      targets.map((target) =>
        serializeKey(target.kind, target.tableName, target.indexName)
      )
    );
    const states = (await ctx.db
      .query(AGGREGATE_STATE_TABLE)
      .collect()) as Array<{
      _id: string;
      kind: string;
      tableKey: string;
      indexName: string;
    }>;
    const stateByKey = new Map(
      states.map((state) => [
        serializeKey(
          state.kind === AGGREGATE_STATE_KIND_RANK ? 'rank' : 'metric',
          state.tableKey,
          state.indexName
        ),
        state,
      ])
    );
    const [bucketRows, memberRows, extremaRows] = await Promise.all([
      ctx.db.query(AGGREGATE_BUCKET_TABLE).collect() as Promise<
        Array<{ tableKey: string; indexName: string }>
      >,
      ctx.db.query(AGGREGATE_MEMBER_TABLE).collect() as Promise<
        Array<{ kind?: string; tableKey: string; indexName: string }>
      >,
      ctx.db.query(AGGREGATE_EXTREMA_TABLE).collect() as Promise<
        Array<{ tableKey: string; indexName: string }>
      >,
    ]);
    const existingKeys = new Set<string>();
    for (const state of states) {
      existingKeys.add(
        serializeKey(
          state.kind === AGGREGATE_STATE_KIND_RANK ? 'rank' : 'metric',
          state.tableKey,
          state.indexName
        )
      );
    }
    for (const row of bucketRows) {
      existingKeys.add(serializeKey('metric', row.tableKey, row.indexName));
    }
    for (const row of memberRows) {
      const kind = row.kind === AGGREGATE_STATE_KIND_RANK ? 'rank' : 'metric';
      existingKeys.add(serializeKey(kind, row.tableKey, row.indexName));
    }
    for (const row of extremaRows) {
      existingKeys.add(serializeKey('metric', row.tableKey, row.indexName));
    }
    let pruned = 0;

    for (const key of existingKeys) {
      const [kind, tableName, indexName] = key.split('\u0000') as [
        'metric' | 'rank',
        string,
        string,
      ];
      if (args.tableName && tableName !== args.tableName) {
        continue;
      }
      if (args.indexName && indexName !== args.indexName) {
        continue;
      }
      if (targetKeys.has(key)) {
        continue;
      }

      if (kind === 'metric') {
        await clearCountIndexData(ctx.db, tableName, indexName);
      } else {
        await clearRankIndexData(ctx.db, tableName, indexName);
      }
      const state = stateByKey.get(key);
      if (state) {
        await ctx.db.delete(AGGREGATE_STATE_TABLE, state._id as any);
      }
      pruned += 1;
    }

    return pruned;
  };

  const kickoff = async (
    ctx: CountBackfillContext,
    args: CountBackfillKickoffArgs
  ) => {
    const targets = getTargets(schema, args);
    const mode = getBackfillMode(args.mode);
    const batchSize = getBackfillBatchSize(args.batchSize);
    const pruned = await pruneRemovedState(ctx, args, targets);
    if (mode === 'prune') {
      return {
        targets: targets.length,
        mode,
        scheduled: 0,
        skippedReady: 0,
        needsRebuild: 0,
        pruned,
        status: 'ok' as const,
      };
    }

    const now = Date.now();
    let scheduled = 0;
    let skippedReady = 0;
    let needsRebuild = 0;

    for (const target of targets) {
      const stateKind =
        target.kind === 'rank'
          ? AGGREGATE_STATE_KIND_RANK
          : AGGREGATE_STATE_KIND_METRIC;
      const existing = await getCountState(
        ctx.db,
        target.tableName,
        target.indexName,
        stateKind
      );
      const keyDefinitionHash = computeKeyDefinitionHash(target);
      const metricDefinitionHash = computeMetricDefinitionHash(target);
      const nextStateBase = {
        tableName: target.tableName,
        indexName: target.indexName,
        keyDefinitionHash,
        metricDefinitionHash,
      };

      if (mode === 'rebuild') {
        if (target.kind === 'rank') {
          await clearRankIndexData(ctx.db, target.tableName, target.indexName);
        } else {
          await clearCountIndexData(ctx.db, target.tableName, target.indexName);
        }
        await setCountState(
          ctx.db,
          {
            ...nextStateBase,
            kind: stateKind,
            status: COUNT_STATUS_BUILDING,
            cursor: null,
            processed: 0,
            startedAt: now,
            updatedAt: now,
            completedAt: null,
            lastError: null,
          },
          stateKind
        );
      } else if (existing) {
        if (existing.keyDefinitionHash !== keyDefinitionHash) {
          needsRebuild += 1;
          continue;
        }

        const metricChanged =
          existing.metricDefinitionHash !== metricDefinitionHash;
        if (metricChanged) {
          const needsMetricBackfill =
            target.kind === 'rank'
              ? true
              : requiresMetricBackfill(
                  existing.metricDefinitionHash,
                  metricDefinitionHash
                );

          if (!needsMetricBackfill && existing.status === COUNT_STATUS_READY) {
            await setCountState(
              ctx.db,
              {
                ...nextStateBase,
                kind: stateKind,
                status: COUNT_STATUS_READY,
                cursor: null,
                processed: existing.processed,
                startedAt: existing.startedAt,
                updatedAt: now,
                completedAt: existing.completedAt ?? now,
                lastError: null,
              },
              stateKind
            );
            skippedReady += 1;
            continue;
          }

          await setCountState(
            ctx.db,
            {
              ...nextStateBase,
              kind: stateKind,
              status: COUNT_STATUS_BUILDING,
              cursor: null,
              processed: 0,
              startedAt: now,
              updatedAt: now,
              completedAt: null,
              lastError: null,
            },
            stateKind
          );
        } else if (existing.status === COUNT_STATUS_READY) {
          skippedReady += 1;
          continue;
        }
      } else {
        await setCountState(
          ctx.db,
          {
            ...nextStateBase,
            kind: stateKind,
            status: COUNT_STATUS_BUILDING,
            cursor: null,
            processed: 0,
            startedAt: now,
            updatedAt: now,
            completedAt: null,
            lastError: null,
          },
          stateKind
        );
      }

      const chunkRef = getChunkRef?.();
      if (ctx.scheduler && chunkRef) {
        await ctx.scheduler.runAfter(0, chunkRef, {
          tableName: target.tableName,
          indexName: target.indexName,
          batchSize,
        });
      }
      scheduled += 1;
    }

    return {
      targets: targets.length,
      mode,
      scheduled,
      skippedReady,
      needsRebuild,
      pruned,
      status: 'ok' as const,
    };
  };

  const chunk = async (
    ctx: CountBackfillContext,
    args: CountBackfillChunkArgs
  ) => {
    const batchSize = getBackfillBatchSize(args.batchSize);
    const targets = getTargets(schema, args);
    if (targets.length > 1) {
      for (const target of targets) {
        const stateKind =
          target.kind === 'rank'
            ? AGGREGATE_STATE_KIND_RANK
            : AGGREGATE_STATE_KIND_METRIC;
        const state = await getCountState(
          ctx.db,
          target.tableName,
          target.indexName,
          stateKind
        );
        if (!state || state.status !== COUNT_STATUS_READY) {
          return chunk(ctx, {
            tableName: target.tableName,
            indexName: target.indexName,
            batchSize,
          });
        }
      }
      return {
        status: 'ok' as const,
      };
    }

    for (const target of targets) {
      const stateKind =
        target.kind === 'rank'
          ? AGGREGATE_STATE_KIND_RANK
          : AGGREGATE_STATE_KIND_METRIC;
      try {
        const state = await getCountState(
          ctx.db,
          target.tableName,
          target.indexName,
          stateKind
        );
        if (!state || state.status === COUNT_STATUS_READY) {
          continue;
        }

        const cursor = state.cursor ?? null;
        const page = await (ctx.db.query(target.tableName) as any)
          .withIndex('by_creation_time')
          .paginate({ cursor, numItems: batchSize });

        for (const doc of page.page as Record<string, unknown>[]) {
          if (target.kind === 'rank') {
            await reconcileRankMembership(ctx.db, {
              tableName: target.tableName,
              definition: {
                name: target.indexName,
                partitionFields: target.fields,
                orderFields: target.orderFields ?? [],
                sumField: target.rankSumField,
              },
              docId: String((doc as any)._id),
              doc,
            });
          } else {
            await reconcileAggregateMembership(ctx.db, {
              tableName: target.tableName,
              indexName: target.indexName,
              docId: String((doc as any)._id),
              keyParts: computeCountKeyParts(doc, target.fields),
              metricValues: computeAggregateMetricValues(doc, {
                name: target.indexName,
                fields: target.fields,
                countFields: target.countFields ?? [],
                sumFields: target.sumFields ?? [],
                avgFields: target.avgFields ?? [],
                minFields: target.minFields ?? [],
                maxFields: target.maxFields ?? [],
              }),
            });
          }
        }

        const now = Date.now();
        const nextProcessed = state.processed + page.page.length;

        if (page.isDone) {
          await setCountState(
            ctx.db,
            {
              tableName: target.tableName,
              indexName: target.indexName,
              kind: stateKind,
              keyDefinitionHash: state.keyDefinitionHash,
              metricDefinitionHash: state.metricDefinitionHash,
              status: COUNT_STATUS_READY,
              cursor: null,
              processed: nextProcessed,
              startedAt: state.startedAt,
              updatedAt: now,
              completedAt: now,
              lastError: null,
            },
            stateKind
          );
          continue;
        }

        await setCountState(
          ctx.db,
          {
            tableName: target.tableName,
            indexName: target.indexName,
            kind: stateKind,
            keyDefinitionHash: state.keyDefinitionHash,
            metricDefinitionHash: state.metricDefinitionHash,
            status: COUNT_STATUS_BUILDING,
            cursor: page.continueCursor,
            processed: nextProcessed,
            startedAt: state.startedAt,
            updatedAt: now,
            completedAt: null,
            lastError: null,
          },
          stateKind
        );

        const chunkRef = getChunkRef?.();
        if (ctx.scheduler && chunkRef) {
          await ctx.scheduler.runAfter(0, chunkRef, {
            tableName: target.tableName,
            indexName: target.indexName,
            batchSize,
          });
        }
      } catch (error) {
        await setCountStateError(
          ctx.db,
          target.tableName,
          target.indexName,
          error,
          stateKind
        );
        throw error;
      }
    }

    return {
      status: 'ok' as const,
    };
  };

  const status = async (
    ctx: { db: GenericDatabaseReader<any> | GenericDatabaseWriter<any> },
    args: CountBackfillStatusArgs
  ) => {
    const states = (await ctx.db
      .query(AGGREGATE_STATE_TABLE)
      .collect()) as Array<{
      _id: string;
      kind: string;
      tableKey: string;
      indexName: string;
      keyDefinitionHash: string;
      metricDefinitionHash: string;
      status: string;
      cursor?: string | null;
      processed: number;
      startedAt: number;
      updatedAt: number;
      completedAt?: number | null;
      lastError?: string | null;
    }>;
    const statesByKey = new Map<string, (typeof states)[number]>(
      states.map(
        (entry) =>
          [
            `${entry.kind === AGGREGATE_STATE_KIND_RANK ? 'rank' : 'metric'}:${entry.tableKey}:${entry.indexName}`,
            entry,
          ] as const
      )
    );

    const targets = getTargets(schema, args);

    return targets.map((target) => {
      const key = `${target.kind}:${target.tableName}:${target.indexName}`;
      const entry = statesByKey.get(key);
      if (!entry) {
        return {
          kind:
            target.kind === 'rank'
              ? AGGREGATE_STATE_KIND_RANK
              : AGGREGATE_STATE_KIND_METRIC,
          tableName: target.tableName,
          indexName: target.indexName,
          keyDefinitionHash: computeKeyDefinitionHash(target),
          metricDefinitionHash: computeMetricDefinitionHash(target),
          status: COUNT_STATUS_BUILDING,
          cursor: null,
          processed: 0,
          startedAt: 0,
          updatedAt: 0,
          completedAt: null,
          lastError: null,
        };
      }
      const { tableKey, ...rest } = entry;
      return {
        ...rest,
        tableName: tableKey,
      };
    });
  };

  return {
    kickoff,
    chunk,
    status,
  };
}
