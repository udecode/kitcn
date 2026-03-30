/** @jsxImportSource solid-js */
/** biome-ignore-all lint/suspicious/noExplicitAny: testing */

import { render, renderHook } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { describe, expect, test, vi } from 'vitest';
import {
  Authenticated,
  AuthProvider,
  ConvexAuthBridge,
  decodeJwtExp,
  MaybeAuthenticated,
  MaybeUnauthenticated,
  Unauthenticated,
  useAuth,
  useAuthGuard,
  useSafeConvexAuth,
} from './auth-store';

const makeJwt = (payload: Record<string, unknown>) => {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
};

describe('decodeJwtExp', () => {
  test('returns expiration in milliseconds when exp claim exists', () => {
    const token = makeJwt({ exp: 1_700_000_000 });
    expect(decodeJwtExp(token)).toBe(1_700_000_000_000);
  });

  test('returns null when exp claim is missing', () => {
    const token = makeJwt({ sub: 'user-1' });
    expect(decodeJwtExp(token)).toBeNull();
  });

  test('returns null for malformed tokens', () => {
    expect(decodeJwtExp('not-a-jwt')).toBeNull();
  });
});

describe('useSafeConvexAuth / useAuth', () => {
  function makeAuthWrapper(initialValues?: Record<string, unknown>) {
    return (props: { children: JSX.Element }) => (
      <AuthProvider initialValues={initialValues as any}>
        {props.children}
      </AuthProvider>
    );
  }

  test('useSafeConvexAuth returns defaults when no auth is configured', () => {
    const { result } = renderHook(() => useSafeConvexAuth());
    expect(result).toEqual({
      isAuthenticated: false,
      isLoading: false,
    });
  });

  test('useSafeConvexAuth + useAuth use ConvexAuthBridge when present', () => {
    const wrapper = (props: { children: JSX.Element }) => (
      <ConvexAuthBridge isAuthenticated={true} isLoading={false}>
        {props.children}
      </ConvexAuthBridge>
    );

    const { result: safeAuth } = renderHook(() => useSafeConvexAuth(), {
      wrapper,
    });
    expect(safeAuth).toEqual({
      isAuthenticated: true,
      isLoading: false,
    });

    const { result: auth } = renderHook(() => useAuth(), { wrapper });
    expect(auth).toEqual({
      hasSession: false,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  test('useAuth (AuthProvider): hasSession reflects token and reads auth state', () => {
    const wrapper = makeAuthWrapper({
      token: 'tok',
      isLoading: true,
      isAuthenticated: false,
    });
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result).toEqual({
      hasSession: true,
      isAuthenticated: false,
      isLoading: true,
    });
  });
});

describe('useAuthGuard', () => {
  function makeAuthWrapper(initialValues?: Record<string, unknown>) {
    return (props: { children: JSX.Element }) => (
      <AuthProvider initialValues={initialValues as any}>
        {props.children}
      </AuthProvider>
    );
  }

  test('calls onMutationUnauthorized and returns true when unauthenticated', () => {
    const onMutationUnauthorized = vi.fn();
    const wrapper = makeAuthWrapper({
      token: 'tok',
      isAuthenticated: false,
      isLoading: false,
      onMutationUnauthorized,
    });

    const { result: guard } = renderHook(() => useAuthGuard(), { wrapper });

    expect(guard()).toBe(true);
    expect(onMutationUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('runs callback and returns false/undefined when authenticated', () => {
    const wrapper = makeAuthWrapper({
      token: 'tok',
      isAuthenticated: true,
      isLoading: false,
    });
    const callback = vi.fn();

    const { result: guard } = renderHook(() => useAuthGuard(), { wrapper });

    expect(guard()).toBe(false);
    expect(guard(callback as any)).toBeUndefined();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('Auth Components', () => {
  function makeAuthWrapper(initialValues?: Record<string, unknown>) {
    return (props: { children: JSX.Element }) => (
      <AuthProvider initialValues={initialValues as any}>
        {props.children}
      </AuthProvider>
    );
  }

  test('MaybeAuthenticated renders children when token exists', () => {
    const Wrapper = makeAuthWrapper({
      token: 'tok',
      isAuthenticated: false,
      isLoading: false,
    });

    const { queryByTestId } = render(() => (
      <Wrapper>
        <MaybeAuthenticated>
          <div data-testid="x">X</div>
        </MaybeAuthenticated>
      </Wrapper>
    ));

    expect(queryByTestId('x')).not.toBeNull();
  });

  test('MaybeUnauthenticated renders children when token is missing', () => {
    const Wrapper = makeAuthWrapper({
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });

    const { queryByTestId } = render(() => (
      <Wrapper>
        <MaybeUnauthenticated>
          <div data-testid="x">X</div>
        </MaybeUnauthenticated>
      </Wrapper>
    ));

    expect(queryByTestId('x')).not.toBeNull();
  });

  test('Authenticated renders children only when authenticated', () => {
    const Wrapper = makeAuthWrapper({
      token: 'tok',
      isAuthenticated: true,
      isLoading: false,
    });

    const { queryByTestId } = render(() => (
      <Wrapper>
        <Authenticated>
          <div data-testid="x">X</div>
        </Authenticated>
      </Wrapper>
    ));

    expect(queryByTestId('x')).not.toBeNull();
  });

  test('Unauthenticated renders children only when not loading and not authenticated', () => {
    const Wrapper = makeAuthWrapper({
      token: 'tok',
      isAuthenticated: false,
      isLoading: false,
    });

    const { queryByTestId } = render(() => (
      <Wrapper>
        <Unauthenticated>
          <div data-testid="x">X</div>
        </Unauthenticated>
      </Wrapper>
    ));

    expect(queryByTestId('x')).not.toBeNull();
  });
});
