import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Ratelimit } from './ratelimit';
import type { ConvexRateLimitDbWriter } from './types';

const RATELIMIT_PLUGIN_REGEX = /ratelimitplugin\(\)/i;
const TIMER_UNSUPPORTED_REGEX = /not supported in convex queries\/mutations/i;

type TableRow = Record<string, unknown> & {
  _id: string;
  _creationTime: number;
};

function createMockDb(options?: { delayMs?: number }) {
  const tables = new Map<string, TableRow[]>();
  const counters = {
    uniqueReads: 0,
    collectReads: 0,
  };

  const getTable = (name: string) => {
    const table = tables.get(name);
    if (table) {
      return table;
    }
    const created: TableRow[] = [];
    tables.set(name, created);
    return created;
  };

  const delay = async () => {
    const ms = options?.delayMs ?? 0;
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  };

  const db: ConvexRateLimitDbWriter = {
    query(tableName: string) {
      const table = getTable(tableName);
      return {
        withIndex(_name, cb) {
          const filters: Array<{ field: string; value: unknown }> = [];
          cb({
            eq(field: string, value: unknown) {
              filters.push({ field, value });
              return this;
            },
          });

          const filtered = () =>
            table.filter((row) =>
              filters.every((filter) => row[filter.field] === filter.value)
            );

          return {
            async unique() {
              counters.uniqueReads += 1;
              await delay();
              return filtered()[0] ?? null;
            },
            async collect() {
              counters.collectReads += 1;
              await delay();
              return filtered();
            },
          };
        },
      };
    },
    async insert(tableName, value) {
      const table = getTable(tableName);
      const id = `${tableName}_${table.length + 1}`;
      table.push({
        _id: id,
        _creationTime: Date.now(),
        ...value,
      } as TableRow);
      return id;
    },
    async patch(id, value) {
      for (const table of tables.values()) {
        const row = table.find((candidate) => candidate._id === id);
        if (row) {
          Object.assign(row, value);
          return;
        }
      }
      throw new Error(`Row not found: ${id}`);
    },
    async delete(tableName, id) {
      const table = getTable(tableName);
      const index = table.findIndex((row) => row._id === id);
      if (index >= 0) {
        table.splice(index, 1);
      }
    },
  };

  return { db, counters };
}

async function withTimersDisabled<T>(run: () => Promise<T>): Promise<T> {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.setTimeout = (() => {
    throw new Error(
      "Can't use setTimeout in queries and mutations. Please consider using an action."
    );
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as unknown as typeof clearTimeout;

  try {
    return await run();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}

describe('Ratelimit', () => {
  beforeEach(() => {
    Math.random = () => 0;
  });

  test('fixed window limits and returns retry metadata', async () => {
    const { db } = createMockDb();
    const limiter = new Ratelimit({
      db,
      limiter: Ratelimit.fixedWindow(2, '10 s'),
    });

    const one = await limiter.limit('user-1');
    const two = await limiter.limit('user-1');
    const three = await limiter.limit('user-1');

    expect(one.success).toBe(true);
    expect(two.success).toBe(true);
    expect(three.success).toBe(false);
    expect(three.reset).toBeGreaterThan(Date.now());
  });

  test('check is non-consuming', async () => {
    const { db } = createMockDb();
    const limiter = new Ratelimit({
      db,
      limiter: Ratelimit.fixedWindow(1, '10 s'),
    });

    const check = await limiter.check('user-2');
    const first = await limiter.limit('user-2');
    const second = await limiter.limit('user-2');

    expect(check.success).toBe(true);
    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
  });

  test('dynamic limits can be set and read', async () => {
    const { db } = createMockDb();
    const limiter = new Ratelimit({
      db,
      dynamicLimits: true,
      prefix: 'dynamic-demo',
      limiter: Ratelimit.fixedWindow(5, '10 s'),
    });

    await limiter.setDynamicLimit({ limit: 1 });
    const current = await limiter.getDynamicLimit();
    expect(current.dynamicLimit).toBe(1);

    await limiter.limit('user-3');
    const second = await limiter.limit('user-3');
    expect(second.success).toBe(false);
  });

  test('deny list rejects matching values with reason', async () => {
    const { db } = createMockDb();
    const limiter = new Ratelimit({
      db,
      enableProtection: true,
      denyList: {
        ips: ['10.0.0.1'],
      },
      limiter: Ratelimit.fixedWindow(2, '10 s'),
    });

    const denied = await limiter.limit('user-4', { ip: '10.0.0.1' });
    expect(denied.success).toBe(false);
    expect(denied.reason).toBe('denyList');
    expect(denied.deniedValue).toBe('10.0.0.1');
  });

  test('timeout in open mode succeeds with timeout reason', async () => {
    const { db } = createMockDb({ delayMs: 25 });
    const limiter = new Ratelimit({
      db,
      timeout: 1,
      failureMode: 'open',
      limiter: Ratelimit.fixedWindow(1, '10 s'),
    });

    const result = await limiter.limit('slow-user');
    expect(result.success).toBe(true);
    expect(result.reason).toBe('timeout');
  });

  test('timeout in closed mode fails with timeout reason', async () => {
    const { db } = createMockDb({ delayMs: 25 });
    const limiter = new Ratelimit({
      db,
      timeout: 1,
      failureMode: 'closed',
      limiter: Ratelimit.fixedWindow(1, '10 s'),
    });

    const result = await limiter.limit('slow-closed-user');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('timeout');
  });

  test('dedupes repeated reads in same invocation path', async () => {
    const { db, counters } = createMockDb();
    const limiter = new Ratelimit({
      db,
      limiter: Ratelimit.fixedWindow(10, '10 s'),
    });

    await limiter.check('user-5');
    await limiter.getValue('user-5', { sampleShards: 1 });
    await limiter.getValue('user-5', { sampleShards: 1 });

    expect(counters.uniqueReads).toBe(1);
  });

  test('degrades safely when timer APIs are unavailable', async () => {
    await withTimersDisabled(async () => {
      const { db } = createMockDb();
      const limiter = new Ratelimit({
        db,
        limiter: Ratelimit.fixedWindow(1, '10 s'),
      });

      const check = await limiter.check('timerless-user');
      const first = await limiter.limit('timerless-user');

      expect(check.success).toBe(true);
      expect(first.success).toBe(true);
    });
  });

  test('blockUntilReady throws actionable error when timers are unavailable', async () => {
    await withTimersDisabled(async () => {
      const { db } = createMockDb();
      const limiter = new Ratelimit({
        db,
        limiter: Ratelimit.fixedWindow(1, '10 s'),
      });

      await limiter.limit('timerless-block-user');

      await expect(
        limiter.blockUntilReady('timerless-block-user', 100)
      ).rejects.toThrow(TIMER_UNSUPPORTED_REGEX);
    });
  });

  test('does not call timer APIs during limit/check (Convex-safe)', async () => {
    const setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation((() => {
        throw new Error('setTimeout should not be called');
      }) as unknown as typeof globalThis.setTimeout);
    const clearTimeoutSpy = vi
      .spyOn(globalThis, 'clearTimeout')
      .mockImplementation((() => {}) as typeof globalThis.clearTimeout);

    try {
      const { db } = createMockDb();
      const limiter = new Ratelimit({
        db,
        timeout: 1,
        failureMode: 'open',
        limiter: Ratelimit.fixedWindow(1, '10 s'),
      });

      const check = await limiter.check('convex-safe-user');
      const limit = await limiter.limit('convex-safe-user');

      expect(check.success).toBe(true);
      expect(limit.success).toBe(true);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(0);
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(0);
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });

  test('throws actionable guidance when ratelimit tables are missing', async () => {
    const db: ConvexRateLimitDbWriter = {
      query() {
        return {
          withIndex() {
            return {
              async unique() {
                throw new Error('Table ratelimit_state does not exist');
              },
              async collect() {
                throw new Error('Table ratelimit_state does not exist');
              },
            };
          },
        };
      },
      async insert() {
        throw new Error('Table ratelimit_state does not exist');
      },
      async patch() {
        throw new Error('Table ratelimit_state does not exist');
      },
      async delete() {
        throw new Error('Table ratelimit_state does not exist');
      },
    };

    const limiter = new Ratelimit({
      db,
      limiter: Ratelimit.fixedWindow(1, '10 s'),
    });

    await expect(limiter.limit('missing-table-user')).rejects.toThrow(
      RATELIMIT_PLUGIN_REGEX
    );
  });
});
