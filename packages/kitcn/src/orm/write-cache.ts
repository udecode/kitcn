import { createOrmTransactionMemo } from './transaction-cache';

type WriteScope = {
  depth: number;
  entries: Map<symbol, Map<string, unknown>>;
};

const scopes = createOrmTransactionMemo<WriteScope>();
const activeScopes = new Set<WriteScope>();
let suspended = 0;

/** Snapshots may survive ORM-owned work, never a return to arbitrary code. */
export const runInOrmWriteScope = async <T>(
  db: unknown,
  fn: () => Promise<T>
): Promise<T> => {
  let scope = scopes.get(db, 'write');
  if (!scope) {
    scope = { depth: 0, entries: new Map() };
    scopes.set(db, 'write', scope);
  }
  scope.entries.clear();
  scope.depth += 1;
  activeScopes.add(scope);
  try {
    return await fn();
  } finally {
    scope.entries.clear();
    scope.depth -= 1;
    if (scope.depth === 0) {
      activeScopes.delete(scope);
    }
  }
};

/**
 * User code can call a nested UDF whose isolated JS context cannot invalidate
 * our snapshots. Suspend every active scope, including reentrant statements,
 * until the callback settles; never restore pre-callback entries.
 */
export const withoutOrmWriteCache = async <T>(
  fn: () => T | Promise<T>
): Promise<Awaited<T>> => {
  for (const scope of activeScopes) {
    scope.entries.clear();
  }
  suspended += 1;
  try {
    return await fn();
  } finally {
    suspended -= 1;
  }
};

export const createOrmWriteMemo = <T>() => {
  const namespace = Symbol('orm-write-memo');
  return {
    get(db: unknown, key: string): T | undefined {
      const scope = scopes.get(db, 'write');
      return !suspended && scope?.depth
        ? (scope.entries.get(namespace)?.get(key) as T | undefined)
        : undefined;
    },
    set(db: unknown, key: string, value: T): void {
      const scope = scopes.get(db, 'write');
      if (suspended || !scope?.depth) {
        return;
      }
      let entries = scope.entries.get(namespace);
      if (!entries) {
        entries = new Map();
        scope.entries.set(namespace, entries);
      }
      entries.set(key, value);
    },
  };
};
