import { useSuspenseQuery } from '@tanstack/react-query';
import { useCRPC } from '@/lib/convex/crpc';

export const useCurrentUser = () => {
  const crpc = useCRPC();

  const { data, ...rest } = useSuspenseQuery(
    crpc.user.getCurrentUser.queryOptions(undefined, { skipUnauth: true })
  );

  return {
    ...rest,
    ...data,
  };
};
