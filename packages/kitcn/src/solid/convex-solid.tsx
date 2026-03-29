/** @jsxImportSource solid-js */

/**
 * Convex Provider for SolidJS
 *
 * Provides ConvexClient via context and auth integration.
 */

import type { AuthTokenFetcher, ConvexClient } from 'convex/browser';
import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  type ParentProps,
  useContext,
} from 'solid-js';

import { ConvexAuthBridge, useConvexAuthBridge } from './auth-store';

type IConvexClient = {
  setAuth(
    fetchToken: AuthTokenFetcher,
    onChange?: (isAuthenticated: boolean) => void
  ): void;
  clearAuth(): void;
};

// ============================================================================
// Convex Context
// ============================================================================

const ConvexContext = createContext<ConvexClient>();

/** Get the ConvexClient instance from context */
export function useConvex(): ConvexClient {
  const client = useContext(ConvexContext);
  if (!client) {
    throw new Error('useConvex must be used within a ConvexProvider');
  }
  return client;
}

// ============================================================================
// ConvexProvider (basic, no auth)
// ============================================================================

export function ConvexProvider(
  props: ParentProps<{
    client: ConvexClient;
  }>
) {
  return (
    <ConvexContext.Provider value={props.client}>
      {props.children}
    </ConvexContext.Provider>
  );
}

// ============================================================================
// ConvexProviderWithAuth
// ============================================================================

export function ConvexProviderWithAuth(
  props: ParentProps<{
    client: ConvexClient;
    useAuth: () => {
      isLoading: boolean;
      isAuthenticated: boolean;
      fetchAccessToken: AuthTokenFetcher;
    };
  }>
) {
  const client = props.client as unknown as IConvexClient;
  const [isConvexLoading, setIsConvexLoading] = createSignal(true);
  const [isConvexAuthenticated, setIsConvexAuthenticated] = createSignal(false);

  // Track auth changes — call useAuth() inside the effect so that
  // reactive reads (signals/stores) within it are tracked by Solid.
  createEffect(() => {
    const auth = props.useAuth();
    const loading = auth.isLoading;
    const authenticated = auth.isAuthenticated;

    if (loading) return;

    if (!authenticated) {
      client.clearAuth();
      setIsConvexLoading(false);
      setIsConvexAuthenticated(false);
      return;
    }

    client.setAuth(auth.fetchAccessToken, (isAuth: boolean) => {
      setIsConvexLoading(false);
      setIsConvexAuthenticated(isAuth);
    });
  });

  onCleanup(() => {
    client.clearAuth();
  });

  return (
    <ConvexContext.Provider value={props.client}>
      <ConvexAuthBridge
        isAuthenticated={isConvexAuthenticated()}
        isLoading={isConvexLoading()}
      >
        {props.children}
      </ConvexAuthBridge>
    </ConvexContext.Provider>
  );
}

// ============================================================================
// useConvexAuth
// ============================================================================

/** Hook returning auth state from Convex */
export function useConvexAuth(): {
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  const bridge = useConvexAuthBridge();
  if (!bridge) {
    return { isLoading: false, isAuthenticated: false };
  }
  return bridge;
}
