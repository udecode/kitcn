// import '../lib/http-polyfills';
import { authMiddleware } from 'better-convex/auth';
import { createHttpRouter } from 'better-convex/server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { router } from '../lib/crpc';
import { getEnv } from '../lib/get-env';
import { examplesRouter } from '../routers/examples';
import { health } from '../routers/health';
import { todosRouter } from '../routers/todos';
import { getAuth } from './generated';

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
  health,
  todos: todosRouter,
  examples: examplesRouter,
});

export default createHttpRouter(app, httpRouter);
