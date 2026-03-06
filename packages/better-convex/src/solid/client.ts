/**
 * ConvexQueryClient - Real-time subscription bridge for TanStack Query + Convex (SolidJS)
 *
 * ## Why This Exists
 *
 * TanStack Query is request-based (fetch once, cache, refetch on stale).
 * Convex is subscription-based (WebSocket push updates in real-time).
 *
 * This client bridges the two by:
 * 1. Listening to TanStack Query cache events (query added/removed)
 * 2. Creating Convex WebSocket subscriptions for each active query
 * 3. Pushing Convex updates into TanStack Query cache
 *
 * ## Architecture
 *
 * ```
 * useConvexQuery (hook)
 *       |
 *       v
 * TanStack Query Cache <---- ConvexQueryClient listens to cache events
 *       |                           |
 *       |                           v
 *       |                    Convex WebSocket subscriptions
 *       |                           |
 *       |                           v
 *       +---------------------- Real-time updates pushed to cache
 * ```
 *
 * ## Subscription Lifecycle
 *
 * WebSocket subscriptions are decoupled from cache retention:
 * - Subscribe when query has observers (component mounted)
 * - Unsubscribe immediately when last observer removed (component unmounted)
 * - Cache data persists for gcTime (default 5 min) for instant back-navigation
 * - On remount: show cached data instantly, re-subscribe for fresh updates
 *
 * ## SSR Support
 *
 * On server: Uses ConvexHttpClient for one-shot queries (no WebSocket).
 * On client: Uses ConvexClient with WebSocket subscriptions.
 *
 * @module
 */

import {
  notifyManager,
  type QueryCache,
  type QueryClient,
  type QueryFunction,
  type QueryFunctionContext,
  type QueryKey,
} from '@tanstack/solid-query';
import { ConvexClient, ConvexHttpClient } from 'convex/browser';
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';
import { CRPCClientError, defaultIsUnauthorized } from '../crpc/error';
import {
  type CombinedDataTransformer,
  type DataTransformerOptions,
  getTransformer,
} from '../crpc/transformer';
import type { ConvexQueryMeta } from '../crpc/types';
import { createHashFn } from '../internal/hash';
import { isConvexQuery } from '../internal/query-key';
import type { AuthStore } from './auth-store';

const isServer = typeof window === 'undefined';

// ============================================================================
// Type Guards for Query Key Format
// ============================================================================

/**
 * Check if query is marked as skipped (used when auth required but not authenticated).
 * Skipped queries have 'skip' as the third element instead of args.
 */
function isConvexSkipped(
  queryKey: readonly unknown[]
): queryKey is ['convexQuery' | 'convexAction', unknown, 'skip'] {
  return (
    queryKey.length >= 2 &&
    ['convexQuery', 'convexAction'].includes(queryKey[0] as string) &&
    queryKey[2] === 'skip'
  );
}

/**
 * Check if query key is for a Convex action function.
 * Format: ['convexAction', 'namespace:functionName', { args }]
 */
function isConvexAction(
  queryKey: readonly unknown[]
): queryKey is ['convexAction', string, Record<string, unknown>] {
  return queryKey.length >= 2 && queryKey[0] === 'convexAction';
}

// ============================================================================
// Configuration
// ============================================================================

export interface ConvexQueryClientOptions {
  /** Auth store for checking auth state in queryFn */
  authStore?: AuthStore;

  /**
   * Opt out of consistent SSR queries for faster performance.
   * Trade-off: queries may return results from different timestamps.
   */
  dangerouslyUseInconsistentQueriesDuringSSR?: boolean;

  /** TanStack QueryClient. Can also be set later via .connect(queryClient) */
  queryClient?: QueryClient;

  /** Custom fetch for SSR. Avoid bundling on client. */
  serverFetch?: typeof globalThis.fetch;

  /** Optional payload transformer (always composed with built-in Date support). */
  transformer?: DataTransformerOptions;

  /**
   * Delay in ms before unsubscribing when a query has no observers.
   * Prevents wasteful unsubscribe/subscribe cycles from component
   * mount/unmount cycles and quick back/forward navigation.
   * Set to 0 to unsubscribe immediately.
   * @default 3000
   */
  unsubscribeDelay?: number;
}

// ============================================================================
// ConvexQueryClient
// ============================================================================

/**
 * Bridges TanStack Query with Convex real-time subscriptions (SolidJS).
 *
 * Uses `ConvexClient.onUpdate()` instead of `ConvexReactClient.watchQuery()`.
 */
export class ConvexQueryClient {
  /** Convex client for WebSocket subscriptions (client) and one-shot queries */
  convexClient: ConvexClient;

  /**
   * Active WebSocket subscriptions, keyed by TanStack query hash.
   * Each subscription has:
   * - getCurrentValue: getter for latest query result
   * - unsubscribe: cleanup function to remove the subscription
   * - queryKey: original query key for cache updates
   * - lastError: most recent error from onError callback
   */
  subscriptions: Record<
    string,
    {
      getCurrentValue: () => unknown;
      unsubscribe: () => void;
      queryKey: ['convexQuery', string, Record<string, unknown>];
      lastError: unknown;
    }
  >;

  /** Cleanup function for QueryCache subscription */
  unsubscribe: (() => void) | undefined;

  /**
   * Pending unsubscribes with timeout IDs.
   * Used to debounce unsubscribe/subscribe cycles.
   */
  private pendingUnsubscribes: Map<string, ReturnType<typeof setTimeout>> =
    new Map();

  /** HTTP client for SSR queries (no WebSocket on server) */
  serverHttpClient?: ConvexHttpClient;

  /** TanStack QueryClient reference */
  _queryClient: QueryClient | undefined;

  /** SSR query mode: 'consistent' guarantees same timestamp, 'inconsistent' is faster */
  ssrQueryMode: 'consistent' | 'inconsistent';

  /** Auth store for checking auth state */
  private authStore?: AuthStore;

  /** Delay before unsubscribing when query has no observers */
  private unsubscribeDelay: number;

  /** Payload transformer used across request/response boundaries. */
  private transformer: CombinedDataTransformer;

  /** Stored URL for creating HTTP client on server */
  private convexUrl: string;

  /** Runtime-safe accessor for pending unsubscribe map (defensive for HMR edge cases) */
  private getPendingUnsubscribesMap() {
    const self = this as unknown as {
      pendingUnsubscribes?: Map<string, ReturnType<typeof setTimeout>>;
    };
    if (!self.pendingUnsubscribes) {
      self.pendingUnsubscribes = new Map();
    }
    return self.pendingUnsubscribes;
  }

  /** Cancel a pending delayed unsubscribe for a query hash. */
  private cancelPendingUnsubscribe(queryHash: string) {
    const pendingUnsubscribes = this.getPendingUnsubscribesMap();
    const timeoutId = pendingUnsubscribes.get(queryHash);
    if (!timeoutId) return;

    clearTimeout(timeoutId);
    pendingUnsubscribes.delete(queryHash);
  }

  /** Unsubscribe a live Convex subscription (if present) and remove it from the subscription map. */
  private unsubscribeQueryByHash(queryHash: string) {
    const sub = this.subscriptions[queryHash];
    if (!sub) return;

    sub.unsubscribe();
    delete this.subscriptions[queryHash];
  }

  /** Update auth store (for HMR where store may reset) */
  updateAuthStore(authStore?: AuthStore) {
    this.authStore = authStore;
  }

  /** Get current auth state from store */
  private getAuthState() {
    if (!this.authStore) return;
    return {
      isLoading: this.authStore.get('isLoading'),
      isAuthenticated: this.authStore.get('isAuthenticated'),
      onUnauthorized: this.authStore.get('onQueryUnauthorized'),
      isUnauthorized: this.authStore.get('isUnauthorized'),
    };
  }

  /**
   * Check if subscription should be skipped due to auth state.
   * Needed for useSuspenseQuery which ignores enabled: false.
   */
  private shouldSkipSubscription(
    authType: 'optional' | 'required' | undefined
  ) {
    if (!authType || !this.authStore) return false;

    const authState = this.getAuthState();
    // Wait for auth to settle before subscribing
    if (authState?.isLoading) return true;
    // For required: also check authenticated
    if (authType === 'required' && !authState?.isAuthenticated) return true;

    return false;
  }

  /** Get QueryClient, throwing if not connected */
  get queryClient() {
    if (!this._queryClient) {
      throw new Error(
        'ConvexQueryClient not connected to TanStack QueryClient.'
      );
    }
    return this._queryClient;
  }

  /**
   * Create a ConvexQueryClient.
   *
   * @param client - Convex URL string or existing ConvexClient
   * @param options - Configuration options
   */
  constructor(
    client: ConvexClient | string,
    options: ConvexQueryClientOptions = {}
  ) {
    if (typeof client === 'string') {
      this.convexClient = new ConvexClient(client);
      this.convexUrl = client;
    } else {
      this.convexClient = client;
      this.convexUrl = client.client.url;
    }

    this.ssrQueryMode = options.dangerouslyUseInconsistentQueriesDuringSSR
      ? 'inconsistent'
      : 'consistent';
    this.subscriptions = {};
    this.authStore = options.authStore;
    this.unsubscribeDelay = options.unsubscribeDelay ?? 3000;
    this.transformer = getTransformer(options.transformer);

    // Auto-connect if queryClient provided in options
    if (options.queryClient) {
      this._queryClient = options.queryClient;
      this.unsubscribe = this.subscribeInner(
        options.queryClient.getQueryCache()
      );
    }

    // Create HTTP client for SSR
    if (isServer) {
      this.serverHttpClient = new ConvexHttpClient(this.convexUrl, {
        fetch: options.serverFetch,
      });
    }
  }

  /**
   * Connect to TanStack QueryClient.
   * Starts listening to cache events for subscription management.
   */
  connect(queryClient: QueryClient) {
    // Already connected to same client - no-op (idempotent for HMR)
    if (this._queryClient === queryClient && this.unsubscribe) {
      return;
    }
    // Different client - unsubscribe from old first
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this._queryClient = queryClient;
    this.unsubscribe = this.subscribeInner(queryClient.getQueryCache());
  }

  /**
   * Clean up all subscriptions.
   * Call this when the client is no longer needed.
   */
  destroy() {
    this.unsubscribe?.();
    // Clear pending unsubscribe timeouts
    for (const timeoutId of this.getPendingUnsubscribesMap().values()) {
      clearTimeout(timeoutId);
    }
    this.getPendingUnsubscribesMap().clear();
    // Unsubscribe all active subscriptions
    for (const sub of Object.values(this.subscriptions)) {
      sub.unsubscribe();
    }
    this.subscriptions = {};
  }

  /**
   * Unsubscribe from all auth-required queries.
   * Call before logout to prevent UNAUTHORIZED errors during session invalidation.
   */
  unsubscribeAuthQueries() {
    for (const queryHash of Object.keys(this.subscriptions)) {
      const query = this.queryClient.getQueryCache().get(queryHash);
      const meta = query?.meta as ConvexQueryMeta | undefined;

      if (meta?.authType === 'required') {
        this.cancelPendingUnsubscribe(queryHash);
        this.unsubscribeQueryByHash(queryHash);
      }
    }
  }

  /**
   * Batch update all subscriptions.
   * Called internally when Convex client reconnects.
   */
  onUpdate = () => {
    notifyManager.batch(() => {
      for (const key of Object.keys(this.subscriptions)) {
        this.onUpdateQueryKeyHash(key);
      }
    });
  };

  /**
   * Handle Convex subscription update for a specific query.
   * Reads latest value from getCurrentValue and updates TanStack cache.
   *
   * @param queryHash - TanStack query hash identifying the query
   */
  onUpdateQueryKeyHash(queryHash: string) {
    const subscription = this.subscriptions[queryHash];
    if (!subscription) {
      throw new Error(
        `Internal ConvexQueryClient error: onUpdateQueryKeyHash called for ${queryHash}`
      );
    }

    const queryCache = this.queryClient.getQueryCache();
    const query = queryCache.get(queryHash);
    if (!query) {
      return;
    }

    const { queryKey, getCurrentValue, lastError } = subscription;

    // Get latest value from Convex subscription
    let result: { ok: true; value: unknown } | { ok: false; error: unknown };
    if (lastError !== undefined) {
      result = { ok: false, error: lastError };
    } else {
      result = { ok: true, value: getCurrentValue() };
    }

    if (result.ok) {
      // Don't overwrite hydrated data with null/undefined from initial subscription
      // getCurrentValue() returns undefined before the server sends the first update
      // Guard against both null and undefined
      const existingData = this.queryClient.getQueryData(queryKey);
      const hasResultValue =
        result.value !== null && result.value !== undefined;
      const hasExistingData =
        existingData !== null && existingData !== undefined;

      if (hasResultValue || !hasExistingData) {
        this.queryClient.setQueryData(
          queryKey,
          this.transformer.output.deserialize(result.value)
        );
      }
    } else {
      const { error } = result;
      const authState = this.getAuthState();
      const meta = query.meta as ConvexQueryMeta | undefined;
      const isUnauthorized = authState?.isUnauthorized(error) ?? false;

      // skipUnauth queries should resolve to null, never surface auth errors/toasts.
      if (isUnauthorized && meta?.skipUnauth) {
        this.queryClient.setQueryData(
          queryKey,
          this.transformer.output.deserialize(null)
        );
        return;
      }

      // Push error state to TanStack cache
      query.setState(
        {
          error: error as Error,
          errorUpdateCount: query.state.errorUpdateCount + 1,
          errorUpdatedAt: Date.now(),
          fetchFailureCount: query.state.fetchFailureCount + 1,
          fetchFailureReason: error as Error,
          fetchStatus: 'idle',
          status: 'error',
        },
        { meta: 'set by ConvexQueryClient' }
      );

      // During logout/auth transitions, auth-required subscriptions can still emit
      // UNAUTHORIZED once. Skip callbacks when we already know auth is unauthenticated.
      if (isUnauthorized && authState?.isAuthenticated) {
        const [, funcName] = queryKey;
        authState.onUnauthorized({ queryName: funcName as string });
      }
    }
  }

  /**
   * Subscribe to TanStack QueryCache events.
   * Creates/removes Convex WebSocket subscriptions as queries are added/removed.
   *
   * @param queryCache - TanStack QueryCache to subscribe to
   * @returns Cleanup function to unsubscribe
   */
  subscribeInner(queryCache: QueryCache): () => void {
    // No subscriptions on server (use HTTP queries instead)
    if (isServer) return () => {};

    return queryCache.subscribe((event) => {
      // Only handle Convex queries - actions are excluded intentionally.
      if (!isConvexQuery(event.query.queryKey)) {
        return;
      }

      // Ignore skipped queries (auth required but not authenticated)
      if (isConvexSkipped(event.query.queryKey)) {
        return;
      }

      switch (event.type) {
        // Query removed from cache -> unsubscribe from Convex (if still subscribed)
        case 'removed': {
          this.cancelPendingUnsubscribe(event.query.queryHash);
          this.unsubscribeQueryByHash(event.query.queryHash);
          break;
        }

        // Query added to cache -> create Convex subscription
        case 'added': {
          // Skip subscription if meta.subscribe === false (one-off query mode)
          const meta = event.query.meta as ConvexQueryMeta | undefined;
          if (meta?.subscribe === false) {
            break;
          }

          const [, funcName, args] = event.query.queryKey;

          // Skip subscription if query has no observers
          if (event.query.getObserversCount() === 0) {
            break;
          }

          // Skip subscription while auth is loading or unauthenticated (for required)
          if (this.shouldSkipSubscription(meta?.authType)) {
            break;
          }

          this.createSubscription(
            event.query.queryHash,
            funcName as string,
            args as Record<string, unknown>,
            event.query.queryKey as [
              'convexQuery',
              string,
              Record<string, unknown>,
            ]
          );
          break;
        }

        // Create subscription when first observer is added (query enabled)
        case 'observerAdded': {
          // Cancel any pending unsubscribe
          this.cancelPendingUnsubscribe(event.query.queryHash);

          // Skip if already subscribed
          if (this.subscriptions[event.query.queryHash]) {
            break;
          }

          // Skip subscription if query is disabled
          if ((event.query.options as any).enabled === false) {
            break;
          }

          // Skip subscription if meta.subscribe === false
          const meta = event.query.meta as ConvexQueryMeta | undefined;
          if (meta?.subscribe === false) {
            break;
          }

          const [, funcName, args] = event.query.queryKey;

          // Skip subscription while auth is loading or unauthenticated (for required)
          if (this.shouldSkipSubscription(meta?.authType)) {
            break;
          }

          this.createSubscription(
            event.query.queryHash,
            funcName as string,
            args as Record<string, unknown>,
            event.query.queryKey as [
              'convexQuery',
              string,
              Record<string, unknown>,
            ]
          );
          break;
        }

        // Debounced unsubscribe when last observer removed (free server resources)
        case 'observerRemoved': {
          if (
            event.query.getObserversCount() === 0 &&
            this.subscriptions[event.query.queryHash]
          ) {
            const queryHash = event.query.queryHash;
            // Schedule unsubscribe after grace period
            const timeoutId = setTimeout(() => {
              this.getPendingUnsubscribesMap().delete(queryHash);
              // Verify still no observers before unsubscribing
              if (event.query.getObserversCount() === 0) {
                this.unsubscribeQueryByHash(queryHash);
              }
            }, this.unsubscribeDelay);
            this.getPendingUnsubscribesMap().set(queryHash, timeoutId);
          }
          break;
        }

        case 'observerResultsUpdated':
          break;

        // Ignore our own updates (marked with meta)
        case 'updated': {
          if (
            event.action.type === 'setState' &&
            event.action.setStateOptions?.meta === 'set by ConvexQueryClient'
          ) {
            break;
          }
          break;
        }

        // Handle when query options change (e.g., enabled: false <-> true)
        case 'observerOptionsUpdated': {
          const isDisabled = (event.query.options as any).enabled === false;
          const isSubscribed = !!this.subscriptions[event.query.queryHash];

          // enabled: true -> false: unsubscribe
          if (isDisabled && isSubscribed) {
            this.cancelPendingUnsubscribe(event.query.queryHash);
            this.unsubscribeQueryByHash(event.query.queryHash);
            break;
          }

          // enabled: false -> true: subscribe (handled below)
          if (isSubscribed || isDisabled) {
            break;
          }

          // Skip subscription if meta.subscribe === false
          const meta = event.query.meta as ConvexQueryMeta | undefined;
          if (meta?.subscribe === false) {
            break;
          }

          const [, funcName, args] = event.query.queryKey;

          // Skip subscription while auth is loading or unauthenticated (for required)
          if (this.shouldSkipSubscription(meta?.authType)) {
            break;
          }

          this.createSubscription(
            event.query.queryHash,
            funcName as string,
            args as Record<string, unknown>,
            event.query.queryKey as [
              'convexQuery',
              string,
              Record<string, unknown>,
            ]
          );
          break;
        }
      }
    });
  }

  /**
   * Create a WebSocket subscription via ConvexClient.onUpdate().
   * Stores the subscription in the subscriptions map.
   */
  private createSubscription(
    queryHash: string,
    funcName: string,
    args: Record<string, unknown>,
    queryKey: ['convexQuery', string, Record<string, unknown>]
  ) {
    // Pre-create the subscription entry so callbacks can reference it
    this.subscriptions[queryHash] = {
      getCurrentValue: () => undefined,
      unsubscribe: () => {},
      queryKey,
      lastError: undefined,
    };

    const unsub = this.convexClient.onUpdate(
      funcName as unknown as FunctionReference<'query'>,
      this.transformer.input.serialize(args) as FunctionArgs<
        FunctionReference<'query'>
      >,
      () => {
        if (this.subscriptions[queryHash]) {
          this.subscriptions[queryHash].lastError = undefined;
        }
        this.onUpdateQueryKeyHash(queryHash);
      },
      (error: Error) => {
        if (this.subscriptions[queryHash]) {
          this.subscriptions[queryHash].lastError = error;
        }
        this.onUpdateQueryKeyHash(queryHash);
      }
    );

    // Update with real values
    this.subscriptions[queryHash].getCurrentValue =
      unsub.getCurrentValue.bind(unsub);
    this.subscriptions[queryHash].unsubscribe = () => unsub();
  }

  /**
   * Create default queryFn for TanStack QueryClient.
   *
   * Handles:
   * - Convex queries and actions
   * - Auth checking (throws CRPCClientError if unauthorized)
   * - SSR via HTTP client
   * - Client via WebSocket client
   *
   * @param otherFetch - Fallback queryFn for non-Convex queries
   * @returns QueryFunction compatible with TanStack Query
   */
  queryFn(
    otherFetch: QueryFunction<unknown, QueryKey> = throwBecauseNotConvexQuery
  ) {
    return async <T extends FunctionReference<'query', 'public'>>(
      context: QueryFunctionContext<readonly unknown[]>
    ): Promise<FunctionReturnType<T>> => {
      const { queryKey, meta: rawMeta } = context;
      const meta = rawMeta as ConvexQueryMeta | undefined;

      // Skipped queries should never run (enabled: false)
      if (isConvexSkipped(queryKey)) {
        throw new Error(
          'Skipped query should not actually run, should { enabled: false }'
        );
      }

      // Handle Convex queries
      if (isConvexQuery(queryKey)) {
        const [, funcName, args] = queryKey;
        const wireArgs = this.transformer.input.serialize(args);
        const skipUnauth = meta?.skipUnauth ?? false;

        // Check auth via authStore if authType in meta
        if (meta?.authType === 'required' && !isServer && this.authStore) {
          const authState = this.getAuthState();
          if (authState && !authState.isLoading && !authState.isAuthenticated) {
            if (skipUnauth) {
              return null as FunctionReturnType<T>;
            }
            authState.onUnauthorized({ queryName: funcName });
            throw new CRPCClientError({
              code: 'UNAUTHORIZED',
              functionName: funcName,
            });
          }
        }

        try {
          // Execute query: HTTP on server, WebSocket on client
          if (isServer) {
            if (this.ssrQueryMode === 'consistent') {
              return this.transformer.output.deserialize(
                await this.serverHttpClient!.consistentQuery(
                  funcName as unknown as FunctionReference<'query'>,
                  wireArgs as any
                )
              ) as FunctionReturnType<T>;
            }
            return this.transformer.output.deserialize(
              await this.serverHttpClient!.query(
                funcName as unknown as FunctionReference<'query'>,
                wireArgs as any
              )
            ) as FunctionReturnType<T>;
          }

          return this.transformer.output.deserialize(
            await this.convexClient.query(
              funcName as unknown as FunctionReference<'query'>,
              wireArgs as any
            )
          ) as FunctionReturnType<T>;
        } catch (error) {
          if (skipUnauth && defaultIsUnauthorized(error)) {
            return null as FunctionReturnType<T>;
          }
          throw error;
        }
      }

      // Handle Convex actions (same pattern as queries)
      if (isConvexAction(queryKey)) {
        const [, funcName, args] = queryKey;
        const wireArgs = this.transformer.input.serialize(args);
        const skipUnauth = meta?.skipUnauth ?? false;

        // Check auth via authStore if authType in meta
        if (meta?.authType === 'required' && !isServer && this.authStore) {
          const authState = this.getAuthState();
          if (authState && !authState.isLoading && !authState.isAuthenticated) {
            if (skipUnauth) {
              return null as FunctionReturnType<T>;
            }
            authState.onUnauthorized({ queryName: funcName });
            throw new CRPCClientError({
              code: 'UNAUTHORIZED',
              functionName: funcName,
            });
          }
        }

        try {
          if (isServer) {
            return this.transformer.output.deserialize(
              await this.serverHttpClient!.action(
                funcName as unknown as FunctionReference<'action'>,
                wireArgs as any
              )
            ) as FunctionReturnType<T>;
          }

          return this.transformer.output.deserialize(
            await this.convexClient.action(
              funcName as unknown as FunctionReference<'action'>,
              wireArgs as any
            )
          ) as FunctionReturnType<T>;
        } catch (error) {
          if (skipUnauth && defaultIsUnauthorized(error)) {
            return null as FunctionReturnType<T>;
          }
          throw error;
        }
      }

      // Fallback to other queryFn for non-Convex queries
      return otherFetch(context) as Promise<FunctionReturnType<T>>;
    };
  }

  /**
   * Create hash function for TanStack QueryClient.
   *
   * Uses Convex-specific hashing for Convex queries to ensure
   * consistent cache keys across serialization.
   *
   * @param fallback - Fallback hash function for non-Convex queries
   * @returns Hash function compatible with TanStack Query
   */
  hashFn(fallback?: (queryKey: readonly unknown[]) => string) {
    return createHashFn(fallback);
  }
}

/** Default fallback queryFn that throws for non-Convex queries */
function throwBecauseNotConvexQuery(
  context: QueryFunctionContext<readonly unknown[]>
) {
  throw new Error(`Query key is not for a Convex Query: ${context.queryKey}`);
}
