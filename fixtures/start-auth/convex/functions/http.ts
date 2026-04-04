import { getEnv } from '../lib/get-env';
import { getAuth } from './generated/auth';
import { cors } from 'hono/cors';
import { authMiddleware } from 'kitcn/auth/http';
import { createHttpRouter } from 'kitcn/server';
import { Hono } from 'hono';
import { router } from '../lib/crpc';
// __KITCN_HTTP_IMPORTS__

const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: getEnv().SITE_URL,
    allowHeaders: ['Content-Type', 'Authorization', 'Better-Auth-Cookie'],
    exposeHeaders: ['Set-Better-Auth-Cookie'],
    credentials: true,
  })
);

app.use(authMiddleware(getAuth));

export const httpRouter = router({
  // __KITCN_HTTP_ROUTES__
});

export default createHttpRouter(app, httpRouter);
