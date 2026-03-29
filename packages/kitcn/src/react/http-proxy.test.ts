import { HttpClientError } from '../crpc/http-types';
import { encodeWire } from '../crpc/transformer';
import { createHttpProxy } from './http-proxy';

const routes = {
  'todos.get': { method: 'GET', path: '/todos/:id' },
  'todos.create': { method: 'POST', path: '/todos' },
} as const;

describe('createHttpProxy', () => {
  test('builds GET queryOptions with path params and search params (including arrays)', async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetchStub = (async (url: string, init?: RequestInit) => {
      calls.push({ init: init ?? {}, url });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }) as unknown as typeof fetch;

    const proxy: any = createHttpProxy<any>({
      convexSiteUrl: 'https://example.convex.site',
      fetch: fetchStub,
      routes,
    });

    const opts = proxy.todos.get.queryOptions({
      params: { id: 'a/b' },
      searchParams: { tag: ['x', 'y'] },
    });
    const result = await opts.queryFn();

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'https://example.convex.site/todos/a%2Fb?tag=x&tag=y'
    );
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.body).toBeUndefined();
  });

  test('builds POST mutationOptions with JSON body and merged headers', async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetchStub = (async (url: string, init?: RequestInit) => {
      calls.push({ init: init ?? {}, url });
      return new Response(JSON.stringify({ created: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }) as unknown as typeof fetch;

    const proxy: any = createHttpProxy<any>({
      convexSiteUrl: 'https://example.convex.site',
      fetch: fetchStub,
      headers: { Authorization: 'Bearer base', Skip: undefined },
      routes,
    });

    const mutation = proxy.todos.create.mutationOptions();
    const res = await mutation.mutationFn({
      // JSON body fields: all non-reserved keys
      title: 'hello',
      done: false,
      // Reserved keys should not be part of JSON body
      params: { id: 'ignored' },
      headers: { Authorization: 'Bearer override' },
    });

    expect(res).toEqual({ created: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://example.convex.site/todos');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: 'Bearer override',
      'Content-Type': 'application/json',
    });
    expect(calls[0]?.init.body).toBe(
      JSON.stringify({ title: 'hello', done: false })
    );
  });

  test('uses form body when args.form is provided (no explicit Content-Type set)', async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetchStub = (async (url: string, init?: RequestInit) => {
      calls.push({ init: init ?? {}, url });
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const proxy: any = createHttpProxy<any>({
      convexSiteUrl: 'https://example.convex.site',
      fetch: fetchStub,
      routes,
    });

    const mutation = proxy.todos.create.mutationOptions();
    await mutation.mutationFn({
      form: { file: new Blob(['x'], { type: 'text/plain' }) },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.body).toBeInstanceOf(FormData);
    expect(calls[0]?.init.headers).not.toMatchObject({
      'Content-Type': expect.any(String),
    });
  });

  test('throws HttpClientError on non-ok responses and calls onError', async () => {
    const onErrorCalls: HttpClientError[] = [];
    const fetchStub = (async () =>
      new Response(
        JSON.stringify({
          error: { code: 'BAD_REQUEST', message: 'nope' },
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 400,
          statusText: 'Bad Request',
        }
      )) as unknown as typeof fetch;

    const proxy: any = createHttpProxy<any>({
      convexSiteUrl: 'https://example.convex.site',
      fetch: fetchStub,
      onError: (e) => onErrorCalls.push(e),
      routes,
    });

    const opts = proxy.todos.get.queryOptions({ params: { id: '1' } });

    await expect(opts.queryFn()).rejects.toBeInstanceOf(HttpClientError);
    expect(onErrorCalls).toHaveLength(1);
    expect(onErrorCalls[0]).toMatchObject({
      code: 'BAD_REQUEST',
      procedureName: 'todos.get',
      status: 400,
    });
  });

  test('queryKey/queryFilter return prefix keys when args are empty', () => {
    const proxy: any = createHttpProxy<any>({
      convexSiteUrl: 'https://example.convex.site',
      routes,
    });

    expect(proxy.todos.get.queryKey()).toEqual(['httpQuery', 'todos.get']);
    expect(proxy.todos.get.queryKey({})).toEqual(['httpQuery', 'todos.get']);
    expect(proxy.todos.get.queryKey({ params: { id: '1' } })).toEqual([
      'httpQuery',
      'todos.get',
      { params: { id: '1' } },
    ]);

    expect(proxy.todos.get.queryFilter()).toEqual({
      queryKey: ['httpQuery', 'todos.get'],
    });
    expect(proxy.todos.get.queryFilter({}, { stale: true })).toEqual({
      queryKey: ['httpQuery', 'todos.get'],
      stale: true,
    });
  });

  test('queryOptions throws when used on non-GET procedures', () => {
    const proxy: any = createHttpProxy<any>({
      convexSiteUrl: 'https://example.convex.site',
      routes,
    });

    expect(() => proxy.todos.create.queryOptions()).toThrow(
      'queryOptions is only available for GET endpoints'
    );
  });

  test('query/mutate throw on unknown procedures', async () => {
    const proxy: any = createHttpProxy<any>({
      convexSiteUrl: 'https://example.convex.site',
      routes,
    });

    expect(() => (proxy as any).unknown.route.query).toThrow(
      'Unknown HTTP procedure'
    );
    expect(() => (proxy as any).unknown.route.mutate).toThrow(
      'Unknown HTTP procedure'
    );
  });

  test('encodes Date JSON body and decodes Date JSON response', async () => {
    const when = new Date('2024-01-01T00:00:00.000Z');
    const fetchStub = (async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload).toEqual(encodeWire({ when }));
      return new Response(JSON.stringify(encodeWire({ createdAt: when })), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }) as unknown as typeof fetch;

    const proxy: any = createHttpProxy<any>({
      convexSiteUrl: 'https://example.convex.site',
      fetch: fetchStub,
      routes,
    });

    const mutation = proxy.todos.create.mutationOptions();
    const result = await mutation.mutationFn({ when } as any);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.getTime()).toBe(when.getTime());
  });

  test('supports custom transformer for request/response payloads', async () => {
    const fetchStub = (async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload).toEqual({ $in: { title: 'x' } });
      return new Response(JSON.stringify({ $out: { ok: true } }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    }) as unknown as typeof fetch;

    const proxy: any = createHttpProxy<any>({
      convexSiteUrl: 'https://example.convex.site',
      fetch: fetchStub,
      routes,
      transformer: {
        input: {
          serialize: (value: unknown) => ({ $in: value }),
          deserialize: (value: unknown) => value,
        },
        output: {
          serialize: (value: unknown) => value,
          deserialize: (value: unknown) => (value as any)?.$out ?? value,
        },
      },
    });

    const mutation = proxy.todos.create.mutationOptions();
    await expect(mutation.mutationFn({ title: 'x' })).resolves.toEqual({
      ok: true,
    });
  });
});
