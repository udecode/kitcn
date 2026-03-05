import type { FunctionReference } from 'convex/server';
import { getFunctionName } from 'convex/server';
import type { Meta } from '../crpc/types';
import { getAuthType } from '../internal/auth';

/** Solid-compatible auth skip logic for queries */
export function useAuthSkip(
  funcRef: FunctionReference<'query' | 'mutation' | 'action'>,
  authState: { isAuthenticated: boolean; isLoading: boolean },
  meta: Meta | undefined,
  opts?: { skipUnauth?: boolean; enabled?: boolean }
) {
  const funcName = getFunctionName(funcRef);
  const authType = getAuthType(meta, funcName);

  const authLoadingApplies = authType === 'optional' || authType === 'required';
  const shouldSkip =
    opts?.enabled === false ||
    (authLoadingApplies && authState.isLoading) ||
    (authType === 'required' &&
      !authState.isAuthenticated &&
      !authState.isLoading) ||
    (!authState.isAuthenticated && !authState.isLoading && !!opts?.skipUnauth);

  return {
    authType,
    isAuthLoading: authState.isLoading,
    isAuthenticated: authState.isAuthenticated,
    shouldSkip,
  };
}
