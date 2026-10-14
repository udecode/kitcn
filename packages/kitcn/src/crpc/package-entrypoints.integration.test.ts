import type { QueryFunctionContext } from '@tanstack/query-core';
import {
  defaultIsUnauthorized,
  isCRPCClientError,
  isCRPCError,
  isCRPCErrorCode,
} from 'kitcn/crpc';
import { ConvexQueryClient as ReactConvexQueryClient } from 'kitcn/react';
import { ConvexQueryClient as SolidConvexQueryClient } from 'kitcn/solid';

const unauthenticatedAuthStore = {
  get: (key: string) => {
    switch (key) {
      case 'isLoading':
        return false;
      case 'isAuthenticated':
        return false;
      case 'onQueryUnauthorized':
        return () => {};
      case 'isUnauthorized':
        return () => false;
      default:
        return;
    }
  },
};

const convexClient = {
  client: { url: 'https://entrypoints.convex.cloud' },
  query: async () => {
    throw new Error('should not execute query');
  },
};

type EntrypointQueryClient = new (
  client: never,
  options: { authStore: never }
) => {
  queryFn: () => (context: QueryFunctionContext) => Promise<unknown>;
};

/** Reject a required-auth query through an adapter's public queryFn. */
const captureUnauthorizedRefusal = async (
  ConvexQueryClient: EntrypointQueryClient
) => {
  const client = new ConvexQueryClient(convexClient as never, {
    authStore: unauthenticatedAuthStore as never,
  });

  try {
    await client.queryFn()({
      meta: { authType: 'required' },
      queryKey: ['convexQuery', 'todos:list', {}],
    } as unknown as QueryFunctionContext);
  } catch (error) {
    return error;
  }

  throw new Error('Expected an UNAUTHORIZED refusal');
};

describe.each([
  ['kitcn/react', ReactConvexQueryClient],
  ['kitcn/solid', SolidConvexQueryClient],
] as const)('%s client errors under kitcn/crpc guards', (_entrypoint, ConvexQueryClient) => {
  test('recognizes the refusal as a deterministic UNAUTHORIZED client error', async () => {
    const error = await captureUnauthorizedRefusal(
      ConvexQueryClient as unknown as EntrypointQueryClient
    );

    expect(isCRPCClientError(error)).toBe(true);
    expect(isCRPCError(error)).toBe(true);
    expect(isCRPCErrorCode(error, 'UNAUTHORIZED')).toBe(true);
    expect(isCRPCErrorCode(error, 'FORBIDDEN')).toBe(false);
    expect(defaultIsUnauthorized(error)).toBe(true);
  });
});
