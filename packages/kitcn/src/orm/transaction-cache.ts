/**
 * Per-transaction memo storage for the ORM.
 *
 * The ORM already has isolate-, execution-, statement- and row-scoped memos.
 * The lifetime it lacked is the one a hook needs: `prependWriteBarrier` is
 * built inside `createOrmDbLifecycle`, which `createOrm` runs at module scope,
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

/**
 * The object whose identity stands in for "this transaction".
 *
 * Convex builds `ctx.db` fresh on every UDF invocation, so it can never be
 * shared by two transactions. `getOrmLifecycleInnerDb` cannot be used on its
 * own: the lifecycle refuses to wrap readers and returns a no-op wrapper for
 * schemas with no triggers and no aggregate indexes, so the inner-db symbol is
 * absent for every query and for most mutations. Resolving through it when it
 * is there, and falling back to the db itself when it is not, converges on the
 * same raw writer from the main scope, `skipRules`, `withoutTriggers` and the
 * scheduled workers.
 *
 * A nested `ctx.runMutation` shares the transaction but gets its own `ctx.db`,
 * so it starts a fresh memo. That direction only costs extra reads.
 */
const resolveTransactionAnchor = (db: unknown): object | undefined => {
  if (typeof db !== 'object' || db === null) {
    return undefined;
  }
  const inner = (db as Record<PropertyKey, unknown>)[ORMLIFECYCLE_INNER_DB];
  return typeof inner === 'object' && inner !== null ? inner : db;
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
      const anchor = resolveTransactionAnchor(db);
      return anchor ? byTransaction.get(anchor)?.get(key) : undefined;
    },
    set(db, key, value) {
      const anchor = resolveTransactionAnchor(db);
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
