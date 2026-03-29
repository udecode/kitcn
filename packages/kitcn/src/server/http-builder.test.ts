import { z } from 'zod';

import { CRPCError } from './error';
import {
  createHttpProcedureBuilder,
  extractPathParams,
  handleHttpError,
  matchPathParams,
} from './http-builder';

describe('server/http-builder', () => {
  test('extractPathParams returns param names in order', () => {
    expect(extractPathParams('/todos/:id')).toEqual(['id']);
    expect(extractPathParams('/orgs/:org_id/users/:userId')).toEqual([
      'org_id',
      'userId',
    ]);
    expect(extractPathParams('/static/path')).toEqual([]);
  });

  test('matchPathParams matches templates and decodes URI components', () => {
    expect(matchPathParams('/todos/:id', '/todos/123')).toEqual({ id: '123' });
    expect(matchPathParams('/todos/:id', '/todos/hello%20world')).toEqual({
      id: 'hello world',
    });
    expect(matchPathParams('/todos/:id', '/todos')).toBeNull();
    expect(matchPathParams('/todos/:id', '/posts/123')).toBeNull();
    expect(matchPathParams('/a/:x/b/:y', '/a/1/b/2')).toEqual({
      x: '1',
      y: '2',
    });
  });

  test('handleHttpError maps CRPCError codes and returns structured JSON', async () => {
    const resp = handleHttpError(
      new CRPCError({ code: 'UNAUTHORIZED', message: 'Nope' })
    );

    expect(resp.status).toBe(401);
    await expect(resp.json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Nope' },
    });
  });

  test('handleHttpError returns 500 for unknown errors', async () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    try {
      const resp = handleHttpError(new Error('boom'));
      expect(resp.status).toBe(500);
      await expect(resp.json()).resolves.toEqual({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('procedure returns 400 BAD_REQUEST when input schema validation fails', async () => {
    const http = createHttpProcedureBuilder({
      base: (handler) => handler as any,
      createContext: () => ({}) as any,
      meta: {},
    });

    const proc = http
      .post('/todos/:id')
      .params(z.object({ id: z.string() }))
      .input(z.object({ name: z.string() }))
      .mutation(async () => ({ ok: true }));

    const resp = await (proc as any)(
      {},
      new Request('https://example.com/todos/123', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 123 }),
      })
    );

    expect(resp.status).toBe(400);
    await expect(resp.json()).resolves.toEqual({
      error: { code: 'BAD_REQUEST', message: 'Invalid input' },
    });
  });

  test('procedure returns 500 when output schema validation fails', async () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    try {
      const http = createHttpProcedureBuilder({
        base: (handler) => handler as any,
        createContext: () => ({}) as any,
        meta: {},
      });

      const proc = http
        .get('/x')
        .output(z.object({ ok: z.boolean() }))
        .query(async () => ({ ok: 'nope' }) as any);

      const resp = await (proc as any)(
        {},
        new Request('https://example.com/x')
      );
      expect(resp.status).toBe(500);
      await expect(resp.json()).resolves.toEqual({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('procedure parses params + searchParams with schema-based coercion', async () => {
    const http = createHttpProcedureBuilder({
      base: (handler) => handler as any,
      createContext: () => ({}) as any,
      meta: {},
    });

    const proc = http
      .get('/todos/:id')
      .params(z.object({ id: z.string() }))
      .searchParams(
        z.object({
          ids: z.array(z.string()),
          limit: z.number(),
          enabled: z.boolean().optional(),
        })
      )
      .query(async ({ params, searchParams }) => ({
        id: params.id,
        ids: searchParams.ids,
        limit: searchParams.limit,
        enabled: searchParams.enabled,
      }));

    const resp = await (proc as any)(
      {},
      new Request(
        'https://example.com/todos/hello%20world?ids=a&ids=b&limit=42&enabled=1'
      )
    );
    expect(resp.status).toBe(200);
    await expect(resp.json()).resolves.toEqual({
      id: 'hello world',
      ids: ['a', 'b'],
      limit: 42,
      enabled: true,
    });
  });

  test('procedure parses application/x-www-form-urlencoded bodies', async () => {
    const http = createHttpProcedureBuilder({
      base: (handler) => handler as any,
      createContext: () => ({}) as any,
      meta: {},
    });

    const proc = http
      .post('/x')
      .input(z.object({ name: z.string() }))
      .mutation(async ({ input }) => input);

    const resp = await (proc as any)(
      {},
      new Request('https://example.com/x', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ name: 'alice' }),
      })
    );

    expect(resp.status).toBe(200);
    await expect(resp.json()).resolves.toEqual({ name: 'alice' });
  });

  test('procedure parses multipart form data via .form()', async () => {
    const http = createHttpProcedureBuilder({
      base: (handler) => handler as any,
      createContext: () => ({}) as any,
      meta: {},
    });

    const proc = http
      .post('/upload')
      .form(z.object({ file: z.any(), note: z.string() }))
      .mutation(async ({ form }) => ({
        hasFile: form.file instanceof File,
        note: form.note,
      }));

    const fd = new FormData();
    fd.set('note', 'hello');
    fd.set('file', new File(['hi'], 'hi.txt', { type: 'text/plain' }));

    const resp = await (proc as any)(
      {},
      new Request('https://example.com/upload', { method: 'POST', body: fd })
    );

    expect(resp.status).toBe(200);
    await expect(resp.json()).resolves.toEqual({
      hasFile: true,
      note: 'hello',
    });
  });

  test('procedure returns Response results directly (does not wrap)', async () => {
    const http = createHttpProcedureBuilder({
      base: (handler) => handler as any,
      createContext: () => ({}) as any,
      meta: {},
    });

    const proc = http
      .get('/x')
      .query(async () => new Response('ok', { status: 201 }));
    const resp = await (proc as any)({}, new Request('https://example.com/x'));
    expect(resp.status).toBe(201);
    await expect(resp.text()).resolves.toBe('ok');
  });

  test('procedure uses custom transformer for body decode and json encode', async () => {
    const http = createHttpProcedureBuilder({
      base: (handler) => handler as any,
      createContext: () => ({}) as any,
      meta: {},
      transformer: {
        input: {
          serialize: (value: unknown) => value,
          deserialize: (value: unknown) => (value as any)?.$in ?? value,
        },
        output: {
          serialize: (value: unknown) => ({ $out: value }),
          deserialize: (value: unknown) => value,
        },
      },
    });

    const proc = http
      .post('/x')
      .input(z.object({ x: z.number() }))
      .mutation(async ({ input }) => ({ x: input.x + 1 }));

    const resp = await (proc as any)(
      {},
      new Request('https://example.com/x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ $in: { x: 1 } }),
      })
    );

    expect(resp.status).toBe(200);
    await expect(resp.json()).resolves.toEqual({
      $out: { x: 2 },
    });
  });
});
