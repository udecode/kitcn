import { describe, expect, test } from 'bun:test';
import { createOrmTransactionMemo } from './transaction-cache';

const ORMLIFECYCLE_INNER_DB = Symbol.for('kitcn:OrmLifecycleInnerDB');

/** Stands in for the writer Convex builds once per function invocation. */
const transaction = () => ({ id: 'raw-writer' });

/** Stands in for a lifecycle wrapper, which is rebuilt per write operation. */
const wrapper = (inner: object) => {
  const wrapped = {};
  Object.defineProperty(wrapped, ORMLIFECYCLE_INNER_DB, {
    configurable: false,
    enumerable: false,
    value: inner,
    writable: false,
  });
  return wrapped;
};

describe('createOrmTransactionMemo', () => {
  test('serves a value stored earlier in the same transaction', () => {
    const memo = createOrmTransactionMemo<number>();
    const db = transaction();

    expect(memo.get(db, 'users')).toBeUndefined();
    memo.set(db, 'users', 1);
    expect(memo.get(db, 'users')).toBe(1);
  });

  test('namespaces by key', () => {
    const memo = createOrmTransactionMemo<number>();
    const db = transaction();

    memo.set(db, 'users', 1);
    expect(memo.get(db, 'posts')).toBeUndefined();
  });

  test('never leaks across transactions', () => {
    const memo = createOrmTransactionMemo<number>();
    const first = transaction();
    const second = transaction();

    memo.set(first, 'users', 1);
    expect(memo.get(second, 'users')).toBeUndefined();
  });

  test('two namespaces on one transaction stay independent', () => {
    const clean = createOrmTransactionMemo<boolean>();
    const other = createOrmTransactionMemo<boolean>();
    const db = transaction();

    clean.set(db, 'users', true);
    expect(other.get(db, 'users')).toBeUndefined();
  });

  /**
   * The write barrier is handed a fresh lifecycle wrapper on every operation,
   * so resolving through the inner-db symbol is the only thing that keeps a
   * multi-row statement on one entry.
   */
  test('resolves distinct lifecycle wrappers to one transaction entry', () => {
    const memo = createOrmTransactionMemo<boolean>();
    const inner = transaction();
    const firstWrite = wrapper(inner);
    const secondWrite = wrapper(inner);

    expect(firstWrite).not.toBe(secondWrite);
    memo.set(firstWrite, 'users', true);
    expect(memo.get(secondWrite, 'users')).toBe(true);
  });

  /**
   * `withoutTriggers` and the scheduled workers build the ORM straight on the
   * inner writer, so they must land on the same entry as the wrapped scope.
   */
  test('a wrapper and its inner writer share one entry', () => {
    const memo = createOrmTransactionMemo<boolean>();
    const inner = transaction();

    memo.set(wrapper(inner), 'users', true);
    expect(memo.get(inner, 'users')).toBe(true);
  });

  /**
   * `createDatabase` puts an `Object.create` carrier in front of whatever it
   * was handed; symbol lookups still resolve through the prototype chain.
   */
  test('reads through the ORM context carrier', () => {
    const memo = createOrmTransactionMemo<boolean>();
    const inner = transaction();
    const carrier = Object.create(wrapper(inner));

    memo.set(inner, 'users', true);
    expect(memo.get(carrier, 'users')).toBe(true);
  });

  test('ignores a non-object db instead of throwing', () => {
    const memo = createOrmTransactionMemo<boolean>();

    expect(() => memo.set(undefined, 'users', true)).not.toThrow();
    expect(memo.get(undefined, 'users')).toBeUndefined();
    expect(memo.get(null, 'users')).toBeUndefined();
  });
});
