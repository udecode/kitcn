/**
 * Per-transaction memo storage for the ORM.
 *
 * The ORM already has isolate-, execution-, statement- and row-scoped memos.
 * A hook needs transaction lifetime: the write barrier is built inside
 * `createOrmDbLifecycle`, which `createOrm` runs at module scope,
 * so a flag in that closure lives as long as the isolate and would leak an
 * answer from one transaction into the next.
 *
 * Deliberately dependency-free, for the same reason as `write-fanout`:
 * `aggregate-index/runtime` is contractually unreachable from `orm/index`
 * (`import-graph.test.ts`), so importing `lifecycle` here to read one symbol
 * would drag the trigger runtime into the aggregate entry's bundle.
 * `Symbol.for` is registry-based, so re-declaring the key resolves to the same
 * symbol `lifecycle` installs.
 */

const ORMLIFECYCLE_INNER_DB = Symbol.for('kitcn:OrmLifecycleInnerDB');
const ORM_TRANSACTION_ANCHOR = Symbol.for('kitcn:OrmTransactionAnchor');

/**
 * Pins `anchor`'s transaction onto `target`, for a db built from a writer that
 * cannot be resolved back to it.
 *
 * `withoutTriggers` re-roots the ORM on the raw `ctx.db`, which is the one
 * object in the chain that carries no inner-db symbol — so a db derived from it
 * would otherwise stand for a transaction of its own and miss every memo and
 * queued write filed under the real one.
 */
export const markOrmTransactionAnchor = <TTarget extends object>(
  target: TTarget,
  db: unknown
): TTarget => {
  const anchor = resolveOrmTransactionAnchor(db);
  if (!anchor || Object.hasOwn(target, ORM_TRANSACTION_ANCHOR)) {
    return target;
  }
  Object.defineProperty(target, ORM_TRANSACTION_ANCHOR, {
    configurable: false,
    enumerable: false,
    value: anchor,
    writable: false,
  });
  return target;
};

/**
 * The object whose identity stands in for "this transaction".
 *
 * Convex builds `ctx.db` fresh on every UDF invocation, so it can never be
 * shared by two transactions. `getOrmLifecycleInnerDb` cannot be used on its
 * own: the lifecycle refuses to wrap readers and returns a no-op wrapper for
 * schemas with no triggers and no aggregate indexes, so the inner-db symbol is
 * absent for every query and for most mutations.
 *
 * Following the symbol to a fixed point, rather than one hop, is what makes the
 * answer canonical: `orm.with(hookCtx)` wraps a writer that is already a hook
 * wrapper, so one hop lands on the intermediate wrapper instead of the raw
 * writer the outer scope filed its work under. A pinned anchor wins outright,
 * because it is the only way a db rooted on the raw writer can name the
 * transaction at all.
 *
 * A nested `ctx.runMutation` shares the transaction but gets its own writer
 * and JS context. It cannot see caller-local memos or queued writes, nor can it
 * invalidate caller snapshots. Callers must flush deferred writes and expire
 * row snapshots before handing control to arbitrary user code.
 */
export const resolveOrmTransactionAnchor = (
  db: unknown
): object | undefined => {
  if (typeof db !== 'object' || db === null) {
    return undefined;
  }
  let current = db as Record<PropertyKey, unknown>;
  // Every wrapper stores a strictly older db, so the chain cannot cycle; the
  // seen set is there so a hand-rolled db that lies about it cannot hang a
  // mutation.
  const seen = new Set<object>([current]);
  for (;;) {
    // Checked at every node, not just the entry: a pin is the only truth a db
    // rooted on the raw writer has, so a wrapper built over one would otherwise
    // walk past it and stop on a db that stands for nothing.
    const pinned = current[ORM_TRANSACTION_ANCHOR];
    if (typeof pinned === 'object' && pinned !== null) {
      return pinned;
    }
    const inner = current[ORMLIFECYCLE_INNER_DB];
    if (typeof inner !== 'object' || inner === null || seen.has(inner)) {
      return current;
    }
    seen.add(inner);
    current = inner as Record<PropertyKey, unknown>;
  }
};

export type OrmTransactionMemo<TValue> = {
  /** The memoized value for `key`, or `undefined` when nothing is stored. */
  get(db: unknown, key: string): TValue | undefined;
  /** Store `value` for the rest of the transaction `db` belongs to. */
  set(db: unknown, key: string, value: TValue): void;
};

/**
 * One memo namespace with transaction lifetime.
 *
 * The store is a `WeakMap` keyed on the anchor rather than a slot on the db,
 * because `createDatabase` promises not to mutate the `ctx.db` it was handed.
 * Entries die with the transaction's db object.
 *
 * Callers own staleness: only memoize a fact that nothing inside the
 * transaction can invalidate.
 */
export const createOrmTransactionMemo = <
  TValue,
>(): OrmTransactionMemo<TValue> => {
  const byTransaction = new WeakMap<object, Map<string, TValue>>();

  return {
    get(db, key) {
      const anchor = resolveOrmTransactionAnchor(db);
      return anchor ? byTransaction.get(anchor)?.get(key) : undefined;
    },
    set(db, key, value) {
      const anchor = resolveOrmTransactionAnchor(db);
      if (!anchor) {
        return;
      }
      const existing = byTransaction.get(anchor);
      if (existing) {
        existing.set(key, value);
        return;
      }
      byTransaction.set(anchor, new Map([[key, value]]));
    },
  };
};
