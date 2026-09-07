/**
 * Statement-scoped deferral for the ORM write path.
 *
 * The lifecycle fires its hooks once per written document, so a subsystem that
 * maintains derived storage — aggregate index buckets, today — reconciles one
 * document at a time and rewrites the same storage document once per row. The
 * fold that would collapse those writes exists; what it lacks is a boundary
 * wide enough to fold across. A mutation statement is that boundary: one
 * `update()` / `delete()` / `insert()` is one unit of work whose derived writes
 * nobody can observe half-applied unless they read them, and a reader can be
 * made to drain first.
 *
 * Depends only on the anchor and row-cache lifetime, for the same reason as
 * `write-fanout`: the mutation builders are reachable from `orm/index`, the
 * aggregate runtime contractually is not (`import-graph.test.ts`), and both
 * ends have to name this module.
 *
 * Three invariants make it safe:
 *
 * 1. Every queued write is applied by `flushOrmWriteBatch` and nowhere else.
 *    Deltas are commutative but the writes that apply them are absolute
 *    read-modify-writes, so two of them interleaving is a lost update. Callers
 *    that have no batch open still enqueue and flush immediately rather than
 *    writing around the queue, which makes the drain the single writer and
 *    therefore the serialization point — the role `lifecycle`'s write lock
 *    plays for the documents it wraps.
 * 2. Aggregate readers and user callbacks drain first. Callback execution
 *    suspends deferral because nested UDFs cannot access the caller's queue.
 * 3. A flush callback must never itself drain. It runs inside the drain, and a
 *    drain in progress is awaited rather than skipped, so re-entering it would
 *    deadlock instead of returning stale rows. Keep the read barrier on the
 *    query-path entry points, which no flush callback calls.
 */

import { resolveOrmTransactionAnchor } from './transaction-cache';
import { withoutOrmWriteCache } from './write-cache';

export type OrmWriteBatchFlush = () => Promise<void>;

type BatchState = {
  /** Open statement scopes. Above zero the queue is held, not applied. */
  depth: number;
  /**
   * Registered by identity, so a subsystem that enqueues on every row of a
   * statement contributes its single flush callback once.
   */
  flushers: Set<OrmWriteBatchFlush>;
  /** The drain in flight, awaited by anything that arrives while it runs. */
  draining: Promise<void> | null;
};

const batches = new WeakMap<object, BatchState>();
const activeBatches = new Set<BatchState>();
let suspended = 0;

const getState = (db: unknown): BatchState | undefined => {
  const anchor = resolveOrmTransactionAnchor(db);
  if (!anchor) {
    return undefined;
  }
  const existing = batches.get(anchor);
  if (existing) {
    return existing;
  }
  const created: BatchState = { depth: 0, flushers: new Set(), draining: null };
  batches.set(anchor, created);
  return created;
};

/**
 * Runs every queued flush callback until none is left.
 *
 * A callback is removed before it runs, so work enqueued while the drain is in
 * flight is picked up by this same loop instead of being dropped or applied
 * twice. `draining` is published before the first callback and cleared in the
 * same synchronous step as the emptiness check that ends the loop, so a
 * caller either sees a drain it can wait for or starts its own — never a
 * window where its work is queued against a drain that has already left.
 */
const drain = (state: BatchState): Promise<void> => {
  if (state.draining) {
    return state.draining;
  }

  let settled = false;
  const running = (async () => {
    try {
      for (;;) {
        const next = state.flushers.values().next();
        if (next.done) {
          return;
        }
        state.flushers.delete(next.value);
        await next.value();
      }
    } finally {
      state.draining = null;
      settled = true;
    }
  })();

  // An async body runs to its first `await` synchronously, so `settled` here
  // means the loop found nothing to do (or a callback threw before suspending).
  // There is no in-flight drain to publish in that case, and publishing one
  // would leave `draining` pointing at an already-settled promise forever.
  if (!settled) {
    state.draining = running;
  }
  return running;
};

/**
 * Opens a write batch for the duration of `fn`.
 *
 * Nesting is reference-counted: a cascade that runs another statement inside
 * this one folds into the same batch rather than flushing the outer statement's
 * pending work early. The flush runs whether or not `fn` threw, so rows that
 * landed before a mid-statement throw still get their derived writes.
 *
 * When both throw, `fn`'s error wins and the flush failure rides along as its
 * `cause`. A plain `finally { await drain() }` would report the consequence and
 * swallow the reason — the statement's own failure is what a caller can act on.
 */
export const runInOrmWriteBatch = async <R>(
  db: unknown,
  fn: () => Promise<R>
): Promise<R> => {
  const state = getState(db);
  if (!state) {
    return await fn();
  }

  state.depth += 1;
  activeBatches.add(state);
  let failure: { error: unknown } | undefined;
  let result: R | undefined;
  try {
    result = await fn();
  } catch (error) {
    failure = { error };
  }

  state.depth -= 1;
  if (state.depth > 0) {
    if (failure) {
      throw failure.error;
    }
    return result as R;
  }

  try {
    await drain(state);
  } catch (flushError) {
    if (!failure) {
      throw flushError;
    }
    if (failure.error instanceof Error && failure.error.cause === undefined) {
      failure.error.cause = flushError;
    }
  } finally {
    if (state.depth === 0) {
      activeBatches.delete(state);
    }
  }

  if (failure) {
    throw failure.error;
  }
  return result as R;
};

/**
 * Queues `flush` for the next drain.
 *
 * Returns `false` only when `db` has no resolvable transaction, which is the
 * caller's signal that this module cannot help and the work has to be done
 * inline.
 */
export const enqueueOrmWriteBatch = (
  db: unknown,
  flush: OrmWriteBatchFlush
): boolean => {
  const state = getState(db);
  if (!state) {
    return false;
  }
  state.flushers.add(flush);
  return true;
};

/** True while a statement scope is holding the queue back. */
export const isOrmWriteBatchOpen = (db: unknown): boolean =>
  suspended === 0 && (getState(db)?.depth ?? 0) > 0;

/** Nested UDFs cannot read or drain queues in the caller's JS context. */
export const runInOrmUserCallback = async <T>(
  fn: () => T | Promise<T>
): Promise<Awaited<T>> =>
  await withoutOrmWriteCache(async () => {
    suspended += 1;
    try {
      for (const state of activeBatches) {
        await drain(state);
      }
      return await fn();
    } finally {
      suspended -= 1;
    }
  });

/**
 * Applies everything queued. Both the read barrier and the only writer.
 *
 * Callers must be outside any flush callback; see this module's header.
 */
export const flushOrmWriteBatch = async (db: unknown): Promise<void> => {
  const anchor = resolveOrmTransactionAnchor(db);
  const state = anchor ? batches.get(anchor) : undefined;
  if (!state || (!state.draining && state.flushers.size === 0)) {
    return;
  }
  await drain(state);
};
