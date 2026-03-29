import { skipToken } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import * as convexReact from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { CRPCClientError } from '../crpc/error';
import { encodeWire } from '../crpc/transformer';
import type { AuthType } from '../internal/auth';
import * as authModule from '../internal/auth';
import * as authStoreModule from './auth-store';
import * as contextModule from './context';
import {
  useConvexActionOptions,
  useConvexActionQueryOptions,
  useConvexInfiniteQueryOptions,
  useConvexMutationOptions,
  useConvexQueryOptions,
  useUploadMutationOptions,
} from './use-query-options';

describe('use-query-options', () => {
  let useAuthSkipSpy: ReturnType<typeof spyOn>;
  let useAuthGuardSpy: ReturnType<typeof spyOn>;
  let useFnMetaSpy: ReturnType<typeof spyOn>;
  let useConvexMutationSpy: ReturnType<typeof spyOn>;
  let useConvexActionSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    useAuthSkipSpy = spyOn(authModule, 'useAuthSkip').mockImplementation(
      (_funcRef: any, _opts?: any) =>
        ({
          authType: undefined,
          shouldSkip: false,
        }) as any
    );

    useAuthGuardSpy = spyOn(authStoreModule, 'useAuthGuard').mockImplementation(
      () => (() => false) as any
    );

    useFnMetaSpy = spyOn(contextModule, 'useFnMeta').mockImplementation(
      () => ((_namespace: string, _fnName: string) => undefined) as any
    );

    useConvexMutationSpy = spyOn(convexReact, 'useMutation').mockImplementation(
      () => (async () => null) as any
    );
    useConvexActionSpy = spyOn(convexReact, 'useAction').mockImplementation(
      () => (async () => null) as any
    );
  });

  afterEach(() => {
    useAuthSkipSpy.mockRestore();
    useAuthGuardSpy.mockRestore();
    useFnMetaSpy.mockRestore();
    useConvexMutationSpy.mockRestore();
    useConvexActionSpy.mockRestore();
  });

  const mutationFnContext = { client: {} as any, meta: undefined } as any;

  test('useConvexQueryOptions handles skipToken and sets enabled=false', () => {
    const fn = makeFunctionReference<'query'>('todos:list');
    useAuthSkipSpy.mockImplementation(
      (_funcRef: any, opts?: { enabled?: boolean }) =>
        ({
          authType: 'required',
          shouldSkip: !!opts && opts.enabled === false,
        }) as any
    );

    const { result } = renderHook(() =>
      useConvexQueryOptions(fn, skipToken, { subscribe: false })
    );

    expect(result.current.enabled).toBe(false);
    expect(result.current.queryKey).toEqual(['convexQuery', 'todos:list', {}]);
    expect(result.current.meta).toMatchObject({
      authType: 'required',
      subscribe: false,
    });
  });

  test('useConvexQueryOptions disables when useAuthSkip indicates shouldSkip', () => {
    const fn = makeFunctionReference<'query'>('todos:list');
    useAuthSkipSpy.mockImplementation(
      () => ({ authType: 'optional', shouldSkip: true }) as any
    );

    const { result } = renderHook(() =>
      useConvexQueryOptions(fn, { status: 'open' } as any, { skipUnauth: true })
    );

    expect(result.current.enabled).toBe(false);
    expect(result.current.meta).toMatchObject({
      authType: 'optional',
      subscribe: true,
    });
  });

  test('useConvexActionQueryOptions uses convexAction key prefix and respects shouldSkip', () => {
    const fn = makeFunctionReference<'action'>('ai:generate');
    useAuthSkipSpy.mockImplementation(
      () => ({ authType: undefined, shouldSkip: true }) as any
    );

    const { result } = renderHook(() =>
      useConvexActionQueryOptions(fn, { prompt: 'hi' } as any, {
        skipUnauth: true,
      })
    );

    expect(result.current.queryKey[0]).toBe('convexAction');
    expect(result.current.enabled).toBe(false);
  });

  test('useConvexInfiniteQueryOptions sets enabled=false for skipToken and forwards authType', () => {
    const fn = makeFunctionReference<'query'>('posts:list');
    useAuthSkipSpy.mockImplementation(
      () => ({ authType: 'required', shouldSkip: false }) as any
    );

    const { result } = renderHook(() =>
      useConvexInfiniteQueryOptions(fn, skipToken, { limit: 20 })
    );

    expect(result.current.enabled).toBe(false);
    expect(result.current.meta).toMatchObject({
      authType: 'required',
      queryName: 'posts:list',
    });
  });

  test('useConvexMutationOptions guards required mutations and throws unauthorized', async () => {
    const fn = makeFunctionReference<'mutation'>('users:update');

    const guard = mock(() => true);
    useAuthGuardSpy.mockImplementation(() => guard as any);

    useFnMetaSpy.mockImplementation(
      () => (() => ({ auth: 'required' satisfies AuthType })) as any
    );

    const convexMutation = mock(async () => ({ ok: true }));
    useConvexMutationSpy.mockImplementation(() => convexMutation as any);

    const { result } = renderHook(() => useConvexMutationOptions(fn));

    await expect(
      result.current.mutationFn?.({ id: 'u1' } as any, mutationFnContext)
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      functionName: 'users:update',
    } satisfies Partial<CRPCClientError>);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(convexMutation).toHaveBeenCalledTimes(0);
  });

  test('useConvexMutationOptions serializes Date args before calling convex mutation', async () => {
    const fn = makeFunctionReference<'mutation'>('todos:create');

    useAuthGuardSpy.mockImplementation(() => (() => false) as any);
    useFnMetaSpy.mockImplementation(
      () => (() => ({ auth: 'optional' satisfies AuthType })) as any
    );

    const convexMutation = mock(async () => ({ ok: true }));
    useConvexMutationSpy.mockImplementation(() => convexMutation as any);

    const { result } = renderHook(() => useConvexMutationOptions(fn));
    const dueDate = new Date('2026-02-02T23:00:00.000Z');

    await result.current.mutationFn?.(
      { dueDate, title: 'x' } as any,
      mutationFnContext
    );

    expect(convexMutation).toHaveBeenCalledTimes(1);
    expect(convexMutation).toHaveBeenCalledWith(
      encodeWire({ dueDate, title: 'x' })
    );
  });

  test('useConvexActionOptions runs action when not guarded', async () => {
    const fn = makeFunctionReference<'action'>('ai:generate');

    const guard = mock(() => true);
    useAuthGuardSpy.mockImplementation(() => guard as any);
    useFnMetaSpy.mockImplementation(
      () => (() => ({ auth: 'optional' satisfies AuthType })) as any
    );

    const convexAction = mock(async () => ({ ok: true }));
    useConvexActionSpy.mockImplementation(() => convexAction as any);

    const { result } = renderHook(() => useConvexActionOptions(fn));

    const out = await result.current.mutationFn?.(
      { prompt: 'hi' } as any,
      mutationFnContext
    );
    expect(out).toEqual({ ok: true });
    expect(convexAction).toHaveBeenCalledTimes(1);
  });

  test('useConvexActionOptions guards required actions and throws unauthorized', async () => {
    const fn = makeFunctionReference<'action'>('ai:generate');

    const guard = mock(() => true);
    useAuthGuardSpy.mockImplementation(() => guard as any);
    useFnMetaSpy.mockImplementation(
      () => (() => ({ auth: 'required' satisfies AuthType })) as any
    );

    const convexAction = mock(async () => ({ ok: true }));
    useConvexActionSpy.mockImplementation(() => convexAction as any);

    const { result } = renderHook(() => useConvexActionOptions(fn));

    await expect(
      result.current.mutationFn?.({ prompt: 'hi' } as any, mutationFnContext)
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      functionName: 'ai:generate',
    } satisfies Partial<CRPCClientError>);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(convexAction).toHaveBeenCalledTimes(0);
  });

  test('useConvexActionOptions serializes Date args before calling convex action', async () => {
    const fn = makeFunctionReference<'action'>('workers:run');

    useAuthGuardSpy.mockImplementation(() => (() => false) as any);
    useFnMetaSpy.mockImplementation(
      () => (() => ({ auth: 'optional' satisfies AuthType })) as any
    );

    const convexAction = mock(async () => ({ ok: true }));
    useConvexActionSpy.mockImplementation(() => convexAction as any);

    const { result } = renderHook(() => useConvexActionOptions(fn));
    const runAt = new Date('2026-02-03T10:00:00.000Z');

    await result.current.mutationFn?.(
      { runAt, force: true } as any,
      mutationFnContext
    );

    expect(convexAction).toHaveBeenCalledTimes(1);
    expect(convexAction).toHaveBeenCalledWith(
      encodeWire({ runAt, force: true })
    );
  });

  test('useUploadMutationOptions uploads via presigned URL and returns result', async () => {
    const generateUrlMutation = makeFunctionReference<'mutation'>(
      'storage:generateUrl'
    ) as any;

    const generateUrl = mock(async (_args: any) => ({
      key: 'k1',
      url: 'https://upload.example',
    }));
    useConvexMutationSpy.mockImplementation(() => generateUrl as any);

    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async (_input: any, _init?: any) =>
        new Response('', { status: 200 })) as any
    );

    const { result } = renderHook(() =>
      useUploadMutationOptions(generateUrlMutation)
    );

    const file = new File([new Blob(['x'], { type: 'text/plain' })], 'x.txt', {
      type: 'text/plain',
    });

    const out = await result.current.mutationFn?.(
      {
        file,
        extra: 'x',
      } as any,
      mutationFnContext
    );

    expect(out).toEqual({ key: 'k1', url: 'https://upload.example' });
    expect(generateUrl).toHaveBeenCalledTimes(1);
    expect(generateUrl.mock.calls[0]?.[0]).toEqual({ extra: 'x' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://upload.example');
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: file,
    });

    fetchSpy.mockRestore();
  });

  test('useUploadMutationOptions throws when upload fails', async () => {
    const generateUrlMutation = makeFunctionReference<'mutation'>(
      'storage:generateUrl'
    ) as any;

    useConvexMutationSpy.mockImplementation(
      () =>
        (async (_args: any) => ({
          key: 'k1',
          url: 'https://upload.example',
        })) as any
    );

    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async (_input: any, _init?: any) =>
        new Response('nope', {
          status: 400,
          statusText: 'Bad Request',
        })) as any
    );

    const { result } = renderHook(() =>
      useUploadMutationOptions(generateUrlMutation)
    );
    const file = new File([new Blob(['x'], { type: 'text/plain' })], 'x.txt', {
      type: 'text/plain',
    });

    await expect(
      result.current.mutationFn?.({ file } as any, mutationFnContext)
    ).rejects.toThrow('Upload failed: Bad Request');

    fetchSpy.mockRestore();
  });
});
