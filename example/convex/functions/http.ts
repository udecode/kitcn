import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from 'kitcn/auth/http';
import { createHttpRouter } from 'kitcn/server';
import { router } from '../lib/crpc';
import { getEnv } from '../lib/get-env';
import { resendWebhook } from '../lib/plugins/resend/webhook';
import { examplesRouter } from '../routers/examples';
import { health } from '../routers/health';
import { todosRouter } from '../routers/todos';
import { getAuth } from './generated/auth';

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
  resendWebhook,
  todos: todosRouter,
  examples: examplesRouter,
});

export default createHttpRouter(app, httpRouter);
