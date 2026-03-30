import { HttpRouter, httpActionGeneric } from 'convex/server';
import { describe, expect, test } from 'vitest';
import { corsRouter } from './cors';

const invoke = async (
  endpoint: unknown,
  request: Request
): Promise<Response> => {
  if (
    endpoint &&
    typeof endpoint === 'object' &&
    typeof (endpoint as { invokeHttpAction?: unknown }).invokeHttpAction ===
      'function'
  ) {
    return (
      endpoint as { invokeHttpAction: (request: Request) => Promise<Response> }
    ).invokeHttpAction(request);
  }

  if (
    endpoint &&
    typeof endpoint === 'object' &&
    typeof (endpoint as { _handler?: unknown })._handler === 'function'
  ) {
    return (
      endpoint as {
        _handler: (ctx: unknown, request: Request) => Promise<Response>;
      }
    )._handler({}, request);
  }

  if (typeof endpoint === 'function') {
    return (endpoint as (ctx: unknown, request: Request) => Promise<Response>)(
      {},
      request
    );
  }

  throw new Error('Unable to invoke CORS endpoint handler');
};

describe('corsRouter (vendored)', () => {
  test('adds OPTIONS handler for exact routes', async () => {
    const http = new HttpRouter();
    const cors = corsRouter(http, {
      allowedOrigins: ['https://example.com'],
    });

    cors.route({
      path: '/test',
      method: 'GET',
      handler: httpActionGeneric(async () => new Response('ok')),
    });

    const routeMap = http.exactRoutes.get('/test');
    const optionsHandler = routeMap?.get('OPTIONS');
    expect(optionsHandler).toBeDefined();

    const response = await invoke(
      optionsHandler,
      new Request('https://example.com/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'GET',
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain(
      'GET'
    );
  });

  test('adds OPTIONS handler for prefix routes', async () => {
    const http = new HttpRouter();
    const cors = corsRouter(http, {
      allowedOrigins: ['https://example.com'],
    });

    cors.route({
      pathPrefix: '/api/',
      method: 'POST',
      handler: httpActionGeneric(async () => new Response('ok')),
    });

    const optionsHandler = http.prefixRoutes.get('OPTIONS')?.get('/api/');
    expect(optionsHandler).toBeDefined();

    const response = await invoke(
      optionsHandler,
      new Request('https://example.com/api/foo', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'POST',
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain(
      'POST'
    );
  });
});
