import { createReadDedupeCache } from '../core/cache';
import type {
  ConvexRateLimitDbReader,
  ConvexRateLimitDbWriter,
  DynamicLimitRow,
  RateLimitRow,
  RateLimitState,
} from '../types';

export const RATE_LIMIT_STATE_TABLE = 'ratelimit_state';
export const RATE_LIMIT_DYNAMIC_TABLE = 'ratelimit_dynamic_limit';
export const RATE_LIMIT_HIT_TABLE = 'ratelimit_protection_hit';
const RATE_LIMIT_TABLE_NAMES = [
  RATE_LIMIT_STATE_TABLE,
  RATE_LIMIT_DYNAMIC_TABLE,
  RATE_LIMIT_HIT_TABLE,
] as const;

const missingDbMessage =
  'Ratelimit requires a Convex db context. Pass `db` in constructor config or use hookAPI().';
const missingTableGuidance =
  'Ratelimit tables are missing. Enable ratelimitPlugin() in defineSchema(..., { plugins: [ratelimitPlugin()] }).';

export class ConvexRateLimitStore {
  private readonly dedupe = createReadDedupeCache<RateLimitRow>();
  private readonly listDedupe = createReadDedupeCache<RateLimitRow[]>();
  private readonly dynamicDedupe = createReadDedupeCache<DynamicLimitRow>();

  constructor(
    private readonly db?: ConvexRateLimitDbReader | ConvexRateLimitDbWriter
  ) {}

  withDb(
    db: ConvexRateLimitDbReader | ConvexRateLimitDbWriter
  ): ConvexRateLimitStore {
    return new ConvexRateLimitStore(db);
  }

  async getState(
    name: string,
    key: string | undefined,
    shard: number
  ): Promise<RateLimitRow | null> {
    return this.withSetupGuidance(async () => {
      const db = this.getReader();
      const cacheKey = stateCacheKey(name, key, shard);
      const cached = this.dedupe.get(cacheKey);
      if (cached) {
        return cached;
      }

      const query = db
        .query(RATE_LIMIT_STATE_TABLE)
        .withIndex('by_name_key_shard', (q: any) =>
          q.eq('name', name).eq('key', key).eq('shard', shard)
        )
        .unique()
        .then((row) => (row ? (row as RateLimitRow) : null));

      this.dedupe.set(cacheKey, query);
      return query;
    });
  }

  async listStates(
    name: string,
    key: string | undefined
  ): Promise<RateLimitRow[]> {
    return this.withSetupGuidance(async () => {
      const db = this.getReader();
      const cacheKey = listCacheKey(name, key);
      const cached = this.listDedupe.get(cacheKey);
      if (cached) {
        return (await cached) ?? [];
      }

      const query = db
        .query(RATE_LIMIT_STATE_TABLE)
        .withIndex('by_name_key', (q: any) => q.eq('name', name).eq('key', key))
        .collect()
        .then((rows) => rows as RateLimitRow[]);

      this.listDedupe.set(cacheKey, query as Promise<RateLimitRow[] | null>);
      return query;
    });
  }

  async upsertState(options: {
    name: string;
    key: string | undefined;
    shard: number;
    state: RateLimitState;
  }): Promise<void> {
    await this.withSetupGuidance(async () => {
      const db = this.getWriter();
      const existing = await this.getState(
        options.name,
        options.key,
        options.shard
      );

      if (existing) {
        await db.patch(existing._id, {
          value: options.state.value,
          ts: options.state.ts,
          auxValue: options.state.auxValue,
          auxTs: options.state.auxTs,
        });
      } else {
        await db.insert(RATE_LIMIT_STATE_TABLE, {
          name: options.name,
          key: options.key,
          shard: options.shard,
          value: options.state.value,
          ts: options.state.ts,
          auxValue: options.state.auxValue,
          auxTs: options.state.auxTs,
        });
      }

      this.invalidate(options.name, options.key, options.shard);
    });
  }

  async deleteStates(name: string, key: string | undefined): Promise<void> {
    await this.withSetupGuidance(async () => {
      const db = this.getWriter();
      const rows = await this.listStates(name, key);

      for (const row of rows) {
        await db.delete(RATE_LIMIT_STATE_TABLE, row._id);
      }

      this.invalidateAll(name, key);
    });
  }

  async getDynamicLimit(prefix: string): Promise<number | null> {
    return this.withSetupGuidance(async () => {
      const db = this.getReader();
      const cacheKey = dynamicCacheKey(prefix);
      const cached = this.dynamicDedupe.get(cacheKey);
      if (cached) {
        const row = await cached;
        return row ? row.limit : null;
      }

      const query = db
        .query(RATE_LIMIT_DYNAMIC_TABLE)
        .withIndex('by_prefix', (q: any) => q.eq('prefix', prefix))
        .unique()
        .then((row) => (row ? (row as DynamicLimitRow) : null));

      this.dynamicDedupe.set(cacheKey, query);
      const row = await query;
      return row ? row.limit : null;
    });
  }

  async setDynamicLimit(prefix: string, limit: number | false): Promise<void> {
    await this.withSetupGuidance(async () => {
      const db = this.getWriter();
      const existing = await db
        .query(RATE_LIMIT_DYNAMIC_TABLE)
        .withIndex('by_prefix', (q: any) => q.eq('prefix', prefix))
        .unique();

      if (limit === false) {
        if (existing?._id) {
          await db.delete(RATE_LIMIT_DYNAMIC_TABLE, existing._id as string);
        }
        this.dynamicDedupe.delete(dynamicCacheKey(prefix));
        return;
      }

      if (existing?._id) {
        await db.patch(existing._id as string, {
          limit,
          updatedAt: Date.now(),
        });
      } else {
        await db.insert(RATE_LIMIT_DYNAMIC_TABLE, {
          prefix,
          limit,
          updatedAt: Date.now(),
        });
      }

      this.dynamicDedupe.delete(dynamicCacheKey(prefix));
    });
  }

  private invalidate(
    name: string,
    key: string | undefined,
    shard: number
  ): void {
    this.dedupe.delete(stateCacheKey(name, key, shard));
    this.listDedupe.delete(listCacheKey(name, key));
  }

  private invalidateAll(name: string, key: string | undefined): void {
    this.listDedupe.delete(listCacheKey(name, key));
    this.dedupe.clear();
  }

  private getReader(): ConvexRateLimitDbReader {
    if (!this.db) {
      throw new Error(missingDbMessage);
    }
    return this.db;
  }

  private getWriter(): ConvexRateLimitDbWriter {
    if (
      !this.db ||
      !('insert' in this.db) ||
      !('patch' in this.db) ||
      !('delete' in this.db)
    ) {
      throw new Error(
        'Ratelimit write operation requires mutation context (db.insert/patch/delete).'
      );
    }
    return this.db;
  }

  private async withSetupGuidance<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw withMissingTableGuidance(error);
    }
  }
}

function stateCacheKey(
  name: string,
  key: string | undefined,
  shard: number
): string {
  return `state:${name}:${key ?? '__global__'}:${shard}`;
}

function listCacheKey(name: string, key: string | undefined): string {
  return `list:${name}:${key ?? '__global__'}`;
}

function dynamicCacheKey(prefix: string): string {
  return `dynamic:${prefix}`;
}

function withMissingTableGuidance(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const isMissingTable = RATE_LIMIT_TABLE_NAMES.some((tableName) => {
    const normalizedTable = tableName.toLowerCase();
    return (
      lower.includes(normalizedTable) &&
      (lower.includes('table') ||
        lower.includes('does not exist') ||
        lower.includes('not found') ||
        lower.includes('unknown'))
    );
  });

  if (!isMissingTable) {
    return error instanceof Error ? error : new Error(message);
  }

  return new Error(`${missingTableGuidance} Original error: ${message}`, {
    cause: error instanceof Error ? error : undefined,
  });
}
