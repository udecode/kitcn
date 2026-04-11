import type { Auth, BetterAuthOptions } from 'better-auth';
import type { HttpRouter } from 'convex/server';

import { registerRoutes } from './registerRoutes';

declare const http: HttpRouter;
declare const getAuth: (ctx: unknown) => Auth<BetterAuthOptions>;

registerRoutes(http, getAuth, { cors: false });
