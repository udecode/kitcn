import {
  type DefaultOptions,
  defaultShouldDehydrateQuery,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query';
import { isCRPCClientError, isCRPCError } from 'kitcn/crpc';
import { toast } from 'sonner';
import SuperJSON from 'superjson';

/** Shared hydration config for SSR data transfer (used by client + server) */
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

/** Create QueryClient for client-side with error handling */
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
      mutations: {
        onError: (err, _variables, _context, mutation) => {
          const error = err as Error & { data?: { message?: string } };
          const meta = mutation.meta as
            | { errorMessage?: string; skipErrorToast?: boolean }
            | undefined;

          // Skip if mutation handles its own errors
          if (meta?.skipErrorToast) return;

          toast.error(
            error.data?.message ||
              meta?.errorMessage ||
              error.message ||
              'Something went wrong'
          );
        },
      },
      queries: {
        retry: (failureCount, error) => {
          // Don't retry deterministic CRPC errors (auth, validation, HTTP 4xx)
          if (isCRPCError(error)) return false;

          const message =
            error instanceof Error ? error.message : String(error);

          // Retry timeouts
          if (message.includes('timed out') && failureCount < 3) {
            console.warn(
              `[QueryClient] Retrying timed out query (attempt ${failureCount + 1}/3)`
            );
            return true;
          }

          return failureCount < 3;
        },
        retryDelay: (attemptIndex) =>
          Math.min(2000 * 2 ** attemptIndex, 30_000),
      },
    },
  });
}
