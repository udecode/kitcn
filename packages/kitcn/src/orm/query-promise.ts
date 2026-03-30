/**
 * Query Promise - Lazy query execution via Promise interface
 *
 * Implements Drizzle's QueryPromise pattern:
 * - Queries don't execute until awaited or .then() is called
 * - Implements full Promise interface (then/catch/finally)
 * - Subclasses provide execute() implementation
 *
 * @example
 * const query = ctx.db.query.users.findMany();
 * // Query not executed yet
 * const users = await query; // Now executed
 */

/**
 * Abstract base class for promise-based query execution
 *
 * @template T - The result type returned by the query
 *
 * Pattern from Drizzle ORM: query-promise.ts:27-31
 */
export abstract class QueryPromise<T> implements Promise<T> {
  /**
   * Promise tag for debugging and type identification
   */
  [Symbol.toStringTag] = 'QueryPromise';

  /**
   * Promise.then() implementation - delegates to execute()
   * This enables lazy evaluation: queries only run when awaited
   */
  then<TResult1 = T, TResult2 = never>(
    onFulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onRejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onFulfilled, onRejected);
  }

  /**
   * Promise.catch() implementation - delegates to execute()
   */
  catch<TResult = never>(
    onRejected?:
      | ((reason: any) => TResult | PromiseLike<TResult>)
      | undefined
      | null
  ): Promise<T | TResult> {
    return this.execute().catch(onRejected);
  }

  /**
   * Promise.finally() implementation - delegates to execute()
   */
  finally(onFinally?: (() => void) | undefined | null): Promise<T> {
    return this.execute().finally(onFinally);
  }

  /**
   * Execute the query and return results
   * Subclasses must implement this method
   *
   * @returns Promise resolving to query results
   */
  abstract execute(): Promise<T>;
}
