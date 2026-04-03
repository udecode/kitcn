import { createHttpRouter } from 'kitcn/server';
import { Hono } from 'hono';
import { router } from '../lib/crpc';
// __KITCN_HTTP_IMPORTS__

const app = new Hono();

export const httpRouter = router({
  // __KITCN_HTTP_ROUTES__
});

export default createHttpRouter(app, httpRouter);
