export const AUTH_START_ROUTE_TEMPLATE = `import { createFileRoute } from '@tanstack/react-router';

import { handler } from '@/lib/convex/auth-server';

export const Route = createFileRoute('/api/auth/$' as never)({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
`;
