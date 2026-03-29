import { renderHook } from '@testing-library/react';
import { makeFunctionReference } from 'convex/server';

import * as authStore from '../react/auth-store';
import * as crpcContext from '../react/context';
import { getAuthType, useAuthSkip } from './auth';

describe('internal/auth', () => {
  let useSafeConvexAuthSpy: ReturnType<typeof spyOn> | undefined;
  let useMetaSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    useSafeConvexAuthSpy?.mockRestore();
    useMetaSpy?.mockRestore();
  });

  test('getAuthType reads auth type from meta', () => {
    const meta = {
      posts: {
        list: { auth: 'required' },
      },
    } as any;

    expect(getAuthType(meta, 'posts:list')).toBe('required');
    expect(getAuthType(meta, 'posts:missing')).toBeUndefined();
    expect(getAuthType(undefined, 'posts:list')).toBeUndefined();
  });

  test('useAuthSkip skips while auth is loading for optional/required auth', () => {
    useSafeConvexAuthSpy = spyOn(
      authStore,
      'useSafeConvexAuth'
    ).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    } as any);
    useMetaSpy = spyOn(crpcContext, 'useMeta').mockReturnValue({
      posts: { list: { auth: 'optional' } },
    } as any);

    const funcRef = makeFunctionReference<'query'>('posts:list');
    const { result } = renderHook(() => useAuthSkip(funcRef));

    expect(result.current.authType).toBe('optional');
    expect(result.current.shouldSkip).toBe(true);
  });

  test('useAuthSkip skips required auth queries when unauthenticated', () => {
    useSafeConvexAuthSpy = spyOn(
      authStore,
      'useSafeConvexAuth'
    ).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as any);
    useMetaSpy = spyOn(crpcContext, 'useMeta').mockReturnValue({
      posts: { list: { auth: 'required' } },
    } as any);

    const funcRef = makeFunctionReference<'query'>('posts:list');
    const { result } = renderHook(() => useAuthSkip(funcRef));

    expect(result.current.authType).toBe('required');
    expect(result.current.shouldSkip).toBe(true);
  });

  test('useAuthSkip respects opts.enabled=false and opts.skipUnauth', () => {
    useSafeConvexAuthSpy = spyOn(
      authStore,
      'useSafeConvexAuth'
    ).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as any);
    useMetaSpy = spyOn(crpcContext, 'useMeta').mockReturnValue({
      posts: { list: { auth: undefined } },
    } as any);

    const funcRef = makeFunctionReference<'query'>('posts:list');

    const { result: disabled } = renderHook(() =>
      useAuthSkip(funcRef, { enabled: false })
    );
    expect(disabled.current.shouldSkip).toBe(true);

    const { result: skipUnauth } = renderHook(() =>
      useAuthSkip(funcRef, { skipUnauth: true })
    );
    expect(skipUnauth.current.shouldSkip).toBe(true);
  });
});
