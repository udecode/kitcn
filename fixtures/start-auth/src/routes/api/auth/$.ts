import { createFileRoute } from '@tanstack/react-router';

import { handler } from '@/lib/convex/auth-server';

// @ts-ignore routeTree.gen.ts is refreshed by TanStack Router during dev/build.
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
