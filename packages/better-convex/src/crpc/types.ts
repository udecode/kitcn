/**
 * CRPC Types
 *
 * Framework-agnostic query types and metadata for tRPC-like Convex API interfaces.
 */

import type { FunctionArgs, FunctionReference } from 'convex/server';

// ============================================================================
// Symbol for FunctionReference (non-serializable)
// ============================================================================

/** Symbol key for attaching FunctionReference to options (non-serializable) */
export const FUNC_REF_SYMBOL: unique symbol = Symbol.for('convex.funcRef');

// ============================================================================
// Reserved Options (tRPC pattern)
// ============================================================================

/** Options controlled by convexQuery/convexAction factories */
export type ReservedQueryOptions = 'queryKey' | 'queryFn' | 'staleTime';

/** Options controlled by mutation factories */
export type ReservedMutationOptions = 'mutationFn';

// ============================================================================
// Meta Types
// ============================================================================

/** Metadata for a single Convex function */
export type FnMeta = {
  auth?: 'required' | 'optional';
  role?: string;
  rateLimit?: string;
  type?: 'query' | 'mutation' | 'action';
  limit?: number;
  [key: string]: unknown;
};

/** Metadata for paginated functions (limit is required) */
export type PaginatedFnMeta = Omit<FnMeta, 'limit'> & { limit: number };

/** Metadata for all Convex functions by namespace.fnName, with _http for HTTP routes */
export type Meta = Record<string, Record<string, FnMeta>> & {
  _http?: Record<string, { path: string; method: string }>;
};

// ============================================================================
// Query Types
// ============================================================================

/** Authentication requirement for a Convex function */
export type AuthType = 'required' | 'optional' | undefined;

/** Query key structure for Convex queries */
export type ConvexQueryKey<T extends FunctionReference<'query'>> = readonly [
  'convexQuery',
  string, // Function name (serialized)
  FunctionArgs<T>,
];

/** Query key structure for Convex actions */
export type ConvexActionKey<T extends FunctionReference<'action'>> = readonly [
  'convexAction',
  string, // Function name (serialized)
  FunctionArgs<T>,
];

/** Mutation key structure for Convex mutations/actions */
export type ConvexMutationKey = ['convexMutation', string];

/**
 * Meta passed to TanStack Query for auth and subscription control.
 * Set by convexQuery, read by ConvexQueryClient.queryFn() and subscribeInner().
 */
export type ConvexQueryMeta = {
  /** Auth type from generated Convex metadata via getMeta() */
  authType?: 'required' | 'optional';
  /** Skip query silently when unauthenticated (returns null) */
  skipUnauth?: boolean;
  /** Whether to create WebSocket subscription (default: true) */
  subscribe?: boolean;
};

/** Hook options for Convex queries */
export type ConvexQueryHookOptions = {
  /** Skip query silently when unauthenticated (default: false, calls onQueryUnauthorized) */
  skipUnauth?: boolean;
  /** Set to false to fetch once without subscribing (default: true) */
  subscribe?: boolean;
};

// ============================================================================
// Pagination Types
// ============================================================================

/** Internal Convex pagination options (used by .paginate()) */
export type PaginationOpts = {
  cursor: string | null;
  numItems: number;
  endCursor?: string | null;
  id?: number;
  maximumRowsRead?: number;
  maximumBytesRead?: number;
};

/** Extract input args without cursor/limit (user's filter args only) */
export type InfiniteQueryInput<TInput> = Omit<TInput, 'cursor' | 'limit'>;

/** Extract item type from PaginationResult<T> */
export type ExtractPaginatedItem<TOutput> = TOutput extends {
  page: (infer T)[];
}
  ? T
  : never;

/** Metadata for infinite query (extends ConvexQueryMeta) */
export type ConvexInfiniteQueryMeta = ConvexQueryMeta & {
  /** The query function name (serializable for RSC) */
  queryName: string;
  /** Query args without cursor/limit (user's filter args only) */
  args: Record<string, unknown>;
  /** Items per page (optional - server uses .paginated() default) */
  limit?: number;
};

// ============================================================================
// Shared Utility Types
// ============================================================================

/** Empty object type */
export type EmptyObject = Record<string, never>;

/** Check if a type has cursor key (pagination detection) */
export type IsPaginated<T> = 'cursor' extends keyof T ? true : false;

/** Static query options parameter type (non-hook, for event handlers) */
export type StaticQueryOptsParam = { skipUnauth?: boolean };

/** Mutation variables type - undefined when no args required (allows mutateAsync() without args) */
export type MutationVariables<
  T extends FunctionReference<'mutation' | 'action'>,
> = keyof FunctionArgs<T> extends never
  ? // biome-ignore lint/suspicious/noConfusingVoidType: TanStack Query requires void for optional variables
    void
  : EmptyObject extends FunctionArgs<T>
    ? FunctionArgs<T> | undefined
    : FunctionArgs<T>;
