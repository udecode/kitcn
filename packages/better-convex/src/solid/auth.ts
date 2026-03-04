import type { FunctionReference } from 'convex/server';
import { getFunctionName } from 'convex/server';
import { getAuthType } from '../internal/auth';
import { useSafeConvexAuth } from './auth-store';
import { useMeta } from './context';

/** Hook to compute auth-based skip logic for queries */
export function useAuthSkip(
  funcRef: FunctionReference<'query' | 'mutation' | 'action'>,
  opts?: { skipUnauth?: boolean; enabled?: boolean }
) {
  const { isAuthenticated, isLoading: isAuthLoading } = useSafeConvexAuth();
  const meta = useMeta();

  const funcName = getFunctionName(funcRef);
  const authType = getAuthType(meta, funcName);

  const authLoadingApplies = authType === 'optional' || authType === 'required';
  const shouldSkip =
    opts?.enabled === false ||
    (authLoadingApplies && isAuthLoading) ||
    (authType === 'required' && !isAuthenticated && !isAuthLoading) ||
    (!isAuthenticated && !isAuthLoading && !!opts?.skipUnauth);

  return { authType, isAuthLoading, isAuthenticated, shouldSkip };
}
