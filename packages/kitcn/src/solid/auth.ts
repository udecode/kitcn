/**
 * SolidJS Auth utilities
 *
 * Provides meta context and auth-skip logic for SolidJS.
 * Port of internal/auth.ts with Solid-specific imports.
 */

import type { FunctionReference } from 'convex/server';
import { getFunctionName } from 'convex/server';
import { createContext, useContext } from 'solid-js';

import type { FnMeta, Meta } from '../crpc/types';
import { useSafeConvexAuth } from './auth-store';

// ============================================================================
// Meta Context
// ============================================================================

const MetaContext = createContext<Meta | undefined>(undefined);
export { MetaContext };

/**
 * Hook to access the meta object from context.
 * Returns undefined if meta was not provided.
 */
export function useMeta(): Meta | undefined {
  return useContext(MetaContext);
}

/**
 * Hook to get function metadata from the meta index.
 */
export function useFnMeta(): (
  namespace: string,
  fnName: string
) => FnMeta | undefined {
  const meta = useMeta();

  return (namespace: string, fnName: string) => meta?.[namespace]?.[fnName];
}

// ============================================================================
// Auth Type
// ============================================================================

export type AuthType = 'required' | 'optional' | undefined;

/** Get auth type from meta for a function */
export function getAuthType(
  meta: Meta | undefined,
  funcName: string
): AuthType {
  const [namespace, fnName] = funcName.split(':');
  return meta?.[namespace]?.[fnName]?.auth as AuthType;
}

// ============================================================================
// Auth Skip
// ============================================================================

/** Hook to compute auth-based skip logic for queries */
export function useAuthSkip(
  funcRef: FunctionReference<'query' | 'mutation' | 'action'>,
  opts?: { skipUnauth?: boolean; enabled?: boolean }
) {
  const auth = useSafeConvexAuth();
  const meta = useMeta();

  const funcName = getFunctionName(funcRef);
  const authType = getAuthType(meta, funcName);

  const authLoadingApplies = authType === 'optional' || authType === 'required';

  // Read auth state lazily via getters so values follow auth transitions
  return {
    authType,
    get isAuthLoading() {
      return auth.isLoading;
    },
    get isAuthenticated() {
      return auth.isAuthenticated;
    },
    get shouldSkip() {
      const isAuthLoading = auth.isLoading;
      const isAuthenticated = auth.isAuthenticated;
      return (
        opts?.enabled === false ||
        (authLoadingApplies && isAuthLoading) ||
        (authType === 'required' && !isAuthenticated && !isAuthLoading) ||
        (!isAuthenticated && !isAuthLoading && !!opts?.skipUnauth)
      );
    },
  };
}
