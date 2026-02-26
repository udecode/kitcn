import { Hono } from 'hono';

import {
  createHttpRouter,
  createHttpRouterFactory,
  extractRouteMap,
} from './http-router';

function makeHttpProc(opts: { path: string; method: string }) {
  const proc = (async () => new Response('ok')) as any;
  proc.isHttp = true;
  proc._crpcHttpRoute = {
    path: opts.path,
    method: opts.method,
    pathParamNames: [],
    usePathPrefix: false,
  };
  return proc;
}

describe('server/http-router', () => {
  test('router factory flattens procedures and nested routers', () => {
    const router = createHttpRouterFactory();

    const health = makeHttpProc({ path: '/api/health', method: 'GET' });
    const nested = router({
      ping: makeHttpProc({ path: '/api/ping', method: 'GET' }),
    });

    const httpRouter = router({
      health,
      nested,
      deep: {
        ok: makeHttpProc({ path: '/api/deep', method: 'POST' }),
      },
    });

    expect(Object.keys(httpRouter._def.procedures).sort()).toEqual([
      'deep.ok',
      'health',
      'nested.ping',
    ]);
  });

  test('extractRouteMap pulls path/method from procedures', () => {
    const procs = {
      health: makeHttpProc({ path: '/api/health', method: 'GET' }),
      create: makeHttpProc({ path: '/api/todos', method: 'POST' }),
    } as const;

    expect(extractRouteMap(procs)).toEqual({
      health: { path: '/api/health', method: 'GET' },
      create: { path: '/api/todos', method: 'POST' },
    });
  });

  test('createHttpRouter registers hono handlers and lookup matches GET/HEAD', () => {
    const app = new Hono();

    // Also add a route that should be ignored by getRoutes() (ALL).
    app.all('/api/all', async (c) => c.text('all'));

    const router = createHttpRouterFactory();

    const health = makeHttpProc({ path: '/api/health', method: 'GET' });
    health._honoHandler = async (c: any) => c.text('ok');

    const createTodo = makeHttpProc({ path: '/api/todos', method: 'POST' });
    createTodo._honoHandler = async (c: any) => c.json({ ok: true });

    const missingHandler = makeHttpProc({
      path: '/api/missing',
      method: 'GET',
    });

    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    const http = createHttpRouter(
      app,
      router({
        health,
        createTodo,
        missingHandler,
      })
    );

    // Procedures without a Hono handler are warned and skipped.
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();

    const routes = http.getRoutes();
    expect(routes.some(([p, m]) => p === '/api/health' && m === 'GET')).toBe(
      true
    );
    expect(routes.some(([p, m]) => p === '/api/todos' && m === 'POST')).toBe(
      true
    );
    expect(routes.some(([p]) => p === '/api/all')).toBe(false);

    expect(http.lookup('/api/health', 'GET')).not.toBeNull();
    expect(http.lookup('/api/health', 'HEAD')).not.toBeNull();
    expect(http.lookup('/api/unknown', 'GET')).toBeNull();
  });
});
