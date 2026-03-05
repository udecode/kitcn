import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';

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

/** Reserved options controlled by infinite query factories */
export type ReservedInfiniteQueryOptions =
  | 'queryKey'
  | 'queryFn'
  | 'staleTime'
  | 'refetchInterval'
  | 'refetchOnMount'
  | 'refetchOnReconnect'
  | 'refetchOnWindowFocus'
  | 'persister'
  | 'placeholderData';

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
// Procedure Decorator Helpers (shared)
// ============================================================================

export type EmptyObject = Record<string, never>;

/** Static query options parameter type (non-hook, for event handlers) */
export type StaticQueryOptsParam = { skipUnauth?: boolean };

/** Check if a type has cursor key (pagination detection) */
export type IsPaginated<T> = 'cursor' extends keyof T ? true : false;

/** Mutation variables type - undefined when no args required (allows mutateAsync() without args) */
export type MutationVariables<
  T extends FunctionReference<'mutation' | 'action'>,
> = keyof FunctionArgs<T> extends never
  ? // biome-ignore lint/suspicious/noConfusingVoidType: TanStack Query requires void for optional variables
    void
  : EmptyObject extends FunctionArgs<T>
    ? FunctionArgs<T> | undefined
    : FunctionArgs<T>;

// ============================================================================
// Base Query Options (framework-agnostic return shapes)
// ============================================================================

/** Base query options shape returned by convexQuery factory */
export type BaseConvexQueryOptions<T extends FunctionReference<'query'>> = {
  queryKey: ConvexQueryKey<T>;
  staleTime?: number;
  enabled?: unknown;
};

/** Base action options shape returned by convexAction factory */
export type BaseConvexActionOptions<T extends FunctionReference<'action'>> = {
  queryKey: ConvexActionKey<T>;
  staleTime?: number;
  enabled?: unknown;
};

/** Base infinite query options parameter */
export type BaseInfiniteQueryOptsParam<
  T extends FunctionReference<'query'> = FunctionReference<'query'>,
> = {
  /** Items per page. Optional - server uses .paginated() default if not provided. */
  limit?: number;
  /** Skip query silently when unauthenticated */
  skipUnauth?: boolean;
  /** Placeholder data shown while loading (item array, not pagination result) */
  placeholderData?: ExtractPaginatedItem<FunctionReturnType<T>>[];
  /** Whether the query is enabled */
  enabled?: unknown;
};

/** Base infinite query options shape */
export type BaseConvexInfiniteQueryOptions<
  T extends FunctionReference<'query'>,
> = {
  queryKey: ConvexQueryKey<T>;
  staleTime?: number;
  enabled?: unknown;
  meta: ConvexInfiniteQueryMeta;
  refetchInterval: false;
  refetchOnMount: false;
  refetchOnReconnect: false;
  refetchOnWindowFocus: false;
  /** Placeholder data shown while loading (item array, not pagination result) */
  placeholderData?: ExtractPaginatedItem<FunctionReturnType<T>>[];
};

// ============================================================================
// Vanilla Client Types (shared shapes)
// ============================================================================

/** Vanilla mutation - direct .mutate() call without TanStack Query */
export type VanillaMutation<T extends FunctionReference<'mutation'>> = {
  mutate: keyof FunctionArgs<T> extends never
    ? (args?: EmptyObject) => Promise<FunctionReturnType<T>>
    : EmptyObject extends FunctionArgs<T>
      ? (args?: FunctionArgs<T>) => Promise<FunctionReturnType<T>>
      : (args: FunctionArgs<T>) => Promise<FunctionReturnType<T>>;
};

/** Vanilla action - both .query() and .mutate() for direct calls */
export type VanillaAction<T extends FunctionReference<'action'>> = {
  query: keyof FunctionArgs<T> extends never
    ? (args?: EmptyObject) => Promise<FunctionReturnType<T>>
    : EmptyObject extends FunctionArgs<T>
      ? (args?: FunctionArgs<T>) => Promise<FunctionReturnType<T>>
      : (args: FunctionArgs<T>) => Promise<FunctionReturnType<T>>;
  mutate: keyof FunctionArgs<T> extends never
    ? (args?: EmptyObject) => Promise<FunctionReturnType<T>>
    : EmptyObject extends FunctionArgs<T>
      ? (args?: FunctionArgs<T>) => Promise<FunctionReturnType<T>>
      : (args: FunctionArgs<T>) => Promise<FunctionReturnType<T>>;
};
