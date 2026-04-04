import {
  type DefaultOptions,
  defaultShouldDehydrateQuery,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query';
import { isCRPCClientError, isCRPCError } from 'kitcn/crpc';
import SuperJSON from 'superjson';

export const hydrationConfig: Pick<DefaultOptions, 'dehydrate' | 'hydrate'> = {
  dehydrate: {
    serializeData: SuperJSON.serialize,
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
    shouldRedactErrors: () => false,
  },
  hydrate: {
    deserializeData: SuperJSON.deserialize,
  },
};

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isCRPCClientError(error)) {
          console.warn(`[CRPC] ${error.code}:`, error.functionName);
        }
      },
    }),
    defaultOptions: {
      ...hydrationConfig,
      queries: {
        retry: (failureCount, error) => {
          if (isCRPCError(error)) return false;
          return failureCount < 3;
        },
      },
    },
  });
}
