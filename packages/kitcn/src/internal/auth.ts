import type { FunctionReference } from 'convex/server';
import { getFunctionName } from 'convex/server';

import type { Meta } from '../crpc/types';
import { useSafeConvexAuth } from '../react/auth-store';
import { useMeta } from '../react/context';

export type AuthType = 'required' | 'optional' | undefined;

/** Get auth type from meta for a function */
export function getAuthType(
  meta: Meta | undefined,
  funcName: string
): AuthType {
  const [namespace, fnName] = funcName.split(':');
  return meta?.[namespace]?.[fnName]?.auth as AuthType;
}

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
