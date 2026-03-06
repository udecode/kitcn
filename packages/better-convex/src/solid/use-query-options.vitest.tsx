/** @jsxImportSource solid-js */
/** biome-ignore-all lint/suspicious/noExplicitAny: testing */

import { renderHook } from '@solidjs/testing-library';
import { skipToken } from '@tanstack/solid-query';
import { makeFunctionReference } from 'convex/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CRPCClientError } from '../crpc/error';
import { encodeWire } from '../crpc/transformer';
import type { AuthType } from './auth';
import * as authModule from './auth';
import * as authStoreModule from './auth-store';
import * as convexSolidModule from './convex-solid';
import {
  useConvexActionOptions,
  useConvexActionQueryOptions,
  useConvexInfiniteQueryOptions,
  useConvexMutationOptions,
  useConvexQueryOptions,
  useUploadMutationOptions,
} from './use-query-options';

describe('use-query-options (solid)', () => {
  let useAuthSkipSpy: ReturnType<typeof vi.spyOn>;
  let useAuthGuardSpy: ReturnType<typeof vi.spyOn>;
  let useFnMetaSpy: ReturnType<typeof vi.spyOn>;
  let useConvexSpy: ReturnType<typeof vi.spyOn>;

  let mockMutation: ReturnType<typeof vi.fn>;
  let mockAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockMutation = vi.fn(async () => null);
    mockAction = vi.fn(async () => null);

    useAuthSkipSpy = vi.spyOn(authModule, 'useAuthSkip').mockImplementation(
      (_funcRef: any, _opts?: any) =>
        ({
          authType: undefined,
          shouldSkip: false,
        }) as any
    );

    useAuthGuardSpy = vi
      .spyOn(authStoreModule, 'useAuthGuard')
      .mockImplementation(() => (() => false) as any);

    useFnMetaSpy = vi
      .spyOn(authModule, 'useFnMeta')
      .mockImplementation(
        () => ((_namespace: string, _fnName: string) => undefined) as any
      );

    useConvexSpy = vi.spyOn(convexSolidModule, 'useConvex').mockImplementation(
      () =>
        ({
          mutation: mockMutation,
          action: mockAction,
        }) as any
    );
  });

  afterEach(() => {
    useAuthSkipSpy.mockRestore();
    useAuthGuardSpy.mockRestore();
    useFnMetaSpy.mockRestore();
    useConvexSpy.mockRestore();
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

    expect(result.enabled).toBe(false);
    expect(result.queryKey).toEqual(['convexQuery', 'todos:list', {}]);
    expect(result.meta).toMatchObject({
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
      useConvexQueryOptions(fn, { status: 'open' } as any, {
        skipUnauth: true,
      })
    );

    expect(result.enabled).toBe(false);
    expect(result.meta).toMatchObject({
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

    expect(result.queryKey[0]).toBe('convexAction');
    expect(result.enabled).toBe(false);
  });

  test('useConvexInfiniteQueryOptions sets enabled=false for skipToken and forwards authType', () => {
    const fn = makeFunctionReference<'query'>('posts:list');
    useAuthSkipSpy.mockImplementation(
      () => ({ authType: 'required', shouldSkip: false }) as any
    );

    const { result } = renderHook(() =>
      useConvexInfiniteQueryOptions(fn, skipToken, { limit: 20 })
    );

    expect(result.enabled).toBe(false);
    expect(result.meta).toMatchObject({
      authType: 'required',
      queryName: 'posts:list',
    });
  });

  test('useConvexMutationOptions guards required mutations and throws unauthorized', async () => {
    const fn = makeFunctionReference<'mutation'>('users:update');

    const guard = vi.fn(() => true);
    useAuthGuardSpy.mockImplementation(() => guard as any);

    useFnMetaSpy.mockImplementation(
      () => (() => ({ auth: 'required' satisfies AuthType })) as any
    );

    mockMutation.mockImplementation(async () => ({ ok: true }));

    const { result } = renderHook(() => useConvexMutationOptions(fn));

    await expect(
      result.mutationFn?.({ id: 'u1' } as any, mutationFnContext)
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      functionName: 'users:update',
    } satisfies Partial<CRPCClientError>);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(mockMutation).toHaveBeenCalledTimes(0);
  });

  test('useConvexMutationOptions serializes Date args before calling convex mutation', async () => {
    const fn = makeFunctionReference<'mutation'>('todos:create');

    useAuthGuardSpy.mockImplementation(() => (() => false) as any);
    useFnMetaSpy.mockImplementation(
      () => (() => ({ auth: 'optional' satisfies AuthType })) as any
    );

    mockMutation.mockImplementation(async () => ({ ok: true }));

    const { result } = renderHook(() => useConvexMutationOptions(fn));
    const dueDate = new Date('2026-02-02T23:00:00.000Z');

    await result.mutationFn?.(
      { dueDate, title: 'x' } as any,
      mutationFnContext
    );

    expect(mockMutation).toHaveBeenCalledTimes(1);
    expect(mockMutation).toHaveBeenCalledWith(
      fn,
      encodeWire({ dueDate, title: 'x' })
    );
  });

  test('useConvexActionOptions runs action when not guarded', async () => {
    const fn = makeFunctionReference<'action'>('ai:generate');

    const guard = vi.fn(() => true);
    useAuthGuardSpy.mockImplementation(() => guard as any);
    useFnMetaSpy.mockImplementation(
      () => (() => ({ auth: 'optional' satisfies AuthType })) as any
    );

    mockAction.mockImplementation(async () => ({ ok: true }));

    const { result } = renderHook(() => useConvexActionOptions(fn));

    const out = await result.mutationFn?.(
      { prompt: 'hi' } as any,
      mutationFnContext
    );
    expect(out).toEqual({ ok: true });
    expect(mockAction).toHaveBeenCalledTimes(1);
  });

  test('useConvexActionOptions guards required actions and throws unauthorized', async () => {
    const fn = makeFunctionReference<'action'>('ai:generate');

    const guard = vi.fn(() => true);
    useAuthGuardSpy.mockImplementation(() => guard as any);
    useFnMetaSpy.mockImplementation(
      () => (() => ({ auth: 'required' satisfies AuthType })) as any
    );

    mockAction.mockImplementation(async () => ({ ok: true }));

    const { result } = renderHook(() => useConvexActionOptions(fn));

    await expect(
      result.mutationFn?.({ prompt: 'hi' } as any, mutationFnContext)
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      functionName: 'ai:generate',
    } satisfies Partial<CRPCClientError>);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(mockAction).toHaveBeenCalledTimes(0);
  });

  test('useConvexActionOptions serializes Date args before calling convex action', async () => {
    const fn = makeFunctionReference<'action'>('workers:run');

    useAuthGuardSpy.mockImplementation(() => (() => false) as any);
    useFnMetaSpy.mockImplementation(
      () => (() => ({ auth: 'optional' satisfies AuthType })) as any
    );

    mockAction.mockImplementation(async () => ({ ok: true }));

    const { result } = renderHook(() => useConvexActionOptions(fn));
    const runAt = new Date('2026-02-03T10:00:00.000Z');

    await result.mutationFn?.({ runAt, force: true } as any, mutationFnContext);

    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockAction).toHaveBeenCalledWith(
      fn,
      encodeWire({ runAt, force: true })
    );
  });

  test('useUploadMutationOptions uploads via presigned URL and returns result', async () => {
    mockMutation.mockImplementation(async (_fn: any, _args: any) => ({
      key: 'k1',
      url: 'https://upload.example',
    }));

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async (_input: any, _init?: any) =>
          new Response('', { status: 200 }) as any
      );

    const generateUrlMutation = makeFunctionReference<'mutation'>(
      'storage:generateUrl'
    ) as any;

    const { result } = renderHook(() =>
      useUploadMutationOptions(generateUrlMutation)
    );

    const file = new File([new Blob(['x'], { type: 'text/plain' })], 'x.txt', {
      type: 'text/plain',
    });

    const out = await result.mutationFn?.(
      {
        file,
        extra: 'x',
      } as any,
      mutationFnContext
    );

    expect(out).toEqual({ key: 'k1', url: 'https://upload.example' });
    expect(mockMutation).toHaveBeenCalledTimes(1);
    expect(mockMutation.mock.calls[0]?.[1]).toEqual({ extra: 'x' });

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
    mockMutation.mockImplementation(async (_fn: any, _args: any) => ({
      key: 'k1',
      url: 'https://upload.example',
    }));

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input: any, _init?: any) =>
        new Response('nope', {
          status: 400,
          statusText: 'Bad Request',
        }) as any
    );

    const generateUrlMutation = makeFunctionReference<'mutation'>(
      'storage:generateUrl'
    ) as any;

    const { result } = renderHook(() =>
      useUploadMutationOptions(generateUrlMutation)
    );
    const file = new File([new Blob(['x'], { type: 'text/plain' })], 'x.txt', {
      type: 'text/plain',
    });

    await expect(
      result.mutationFn?.({ file } as any, mutationFnContext)
    ).rejects.toThrow('Upload failed: Bad Request');

    fetchSpy.mockRestore();
  });
});
