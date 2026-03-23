import { createHttpRouter } from 'better-convex/server';
import { Hono } from 'hono';
import { router } from '../lib/crpc';
// __BETTER_CONVEX_HTTP_IMPORTS__

const app = new Hono();

export const httpRouter = router({
  // __BETTER_CONVEX_HTTP_ROUTES__
});

export default createHttpRouter(app, httpRouter);
