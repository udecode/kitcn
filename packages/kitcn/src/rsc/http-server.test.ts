import { buildHttpQueryOptions, fetchHttpRoute } from './http-server';

const HTTP_403_NOPE_RE = /HTTP 403: nope/;

describe('rsc/http-server', () => {
  let fetchSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
  });

  test('buildHttpQueryOptions matches client key format and stores route meta', () => {
    const opts = buildHttpQueryOptions(
      { path: '/api/health', method: 'GET' },
      'health',
      { a: 1 }
    );

    expect(opts.queryKey).toEqual(['httpQuery', 'health', { a: 1 }]);
    expect(opts.meta).toEqual({ path: '/api/health', method: 'GET' });
  });

  test('fetchHttpRoute builds URL with path params and query params, and sends auth header', async () => {
    const mockFetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          'https://example.convex.site/api/todos/a%20b?foo=bar&n=1'
        );

        expect(init?.method).toBe('GET');
        expect(init?.headers).toMatchObject({
          'Content-Type': 'application/json',
          Authorization: 'Bearer t0',
        });

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-length': '12' },
        });
      },
      // Bun's fetch has extra static helpers like fetch.preconnect().
      { preconnect: () => {} }
    ) as typeof fetch;

    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(mockFetch);

    const args = { id: 'a b', foo: 'bar', n: 1, ignore: null };
    await expect(
      fetchHttpRoute(
        'https://example.convex.site',
        { path: '/api/todos/:id', method: 'GET' },
        args,
        't0'
      )
    ).resolves.toEqual({ ok: true });

    // Ensure args are not mutated.
    expect(args).toEqual({ id: 'a b', foo: 'bar', n: 1, ignore: null });
  });

  test('fetchHttpRoute returns null for empty responses', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 204 })
    );

    await expect(
      fetchHttpRoute(
        'https://example.convex.site',
        { path: '/api/health', method: 'GET' },
        {},
        undefined
      )
    ).resolves.toBeNull();

    fetchSpy.mockRestore();
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 200, headers: { 'content-length': '0' } })
    );

    await expect(
      fetchHttpRoute(
        'https://example.convex.site',
        { path: '/api/health', method: 'GET' },
        {},
        undefined
      )
    ).resolves.toBeNull();
  });

  test('fetchHttpRoute throws for non-ok responses and includes status and body', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('nope', { status: 403 })
    );

    await expect(
      fetchHttpRoute(
        'https://example.convex.site',
        { path: '/api/secret', method: 'GET' },
        {},
        undefined
      )
    ).rejects.toThrow(HTTP_403_NOPE_RE);
  });
});
