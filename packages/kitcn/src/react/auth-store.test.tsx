import { render, renderHook } from '@testing-library/react';
import * as convexReact from 'convex/react';
import type { ReactNode } from 'react';
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
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' })
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
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
    return ({ children }: { children: ReactNode }) => (
      <AuthProvider initialValues={initialValues as any}>
        {children}
      </AuthProvider>
    );
  }

  test('useSafeConvexAuth returns defaults when no auth is configured', () => {
    const { result } = renderHook(() => useSafeConvexAuth());
    expect(result.current).toEqual({
      isAuthenticated: false,
      isLoading: false,
    });
  });

  test('useSafeConvexAuth + useAuth use ConvexAuthBridge when present (no token access)', () => {
    const useConvexAuthSpy = spyOn(
      convexReact,
      'useConvexAuth'
    ).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as any);

    try {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ConvexAuthBridge>{children}</ConvexAuthBridge>
      );

      const { result: safeAuth } = renderHook(() => useSafeConvexAuth(), {
        wrapper,
      });
      expect(safeAuth.current).toEqual({
        isAuthenticated: true,
        isLoading: false,
      });

      const { result: auth } = renderHook(() => useAuth(), { wrapper });
      expect(auth.current).toEqual({
        hasSession: false,
        isAuthenticated: true,
        isLoading: false,
      });
    } finally {
      useConvexAuthSpy.mockRestore();
    }
  });

  test('useAuth (kitcn AuthProvider): hasSession reflects token and reads auth state from Convex', () => {
    const useConvexAuthSpy = spyOn(
      convexReact,
      'useConvexAuth'
    ).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    } as any);

    try {
      const wrapper = makeAuthWrapper({ token: 'tok' });
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current).toEqual({
        hasSession: true,
        isAuthenticated: false,
        isLoading: true,
      });
    } finally {
      useConvexAuthSpy.mockRestore();
    }
  });
});

describe('useAuthGuard', () => {
  function makeAuthWrapper(initialValues?: Record<string, unknown>) {
    return ({ children }: { children: ReactNode }) => (
      <AuthProvider initialValues={initialValues as any}>
        {children}
      </AuthProvider>
    );
  }

  test('calls onMutationUnauthorized and returns true when unauthenticated', () => {
    const useConvexAuthSpy = spyOn(
      convexReact,
      'useConvexAuth'
    ).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as any);

    try {
      const onMutationUnauthorized = mock(() => {});
      const wrapper = makeAuthWrapper({ token: 'tok', onMutationUnauthorized });

      const { result } = renderHook(() => useAuthGuard(), { wrapper });

      expect(result.current()).toBe(true);
      expect(onMutationUnauthorized).toHaveBeenCalledTimes(1);
    } finally {
      useConvexAuthSpy.mockRestore();
    }
  });

  test('runs callback and returns false/undefined when authenticated', () => {
    const useConvexAuthSpy = spyOn(
      convexReact,
      'useConvexAuth'
    ).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as any);

    try {
      const wrapper = makeAuthWrapper({ token: 'tok' });
      const callback = mock(() => {});

      const { result } = renderHook(() => useAuthGuard(), { wrapper });

      expect(result.current()).toBe(false);
      expect(result.current(callback as any)).toBeUndefined();
      expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      useConvexAuthSpy.mockRestore();
    }
  });
});

describe('Auth Components', () => {
  function makeAuthWrapper(initialValues?: Record<string, unknown>) {
    return ({ children }: { children: ReactNode }) => (
      <AuthProvider initialValues={initialValues as any}>
        {children}
      </AuthProvider>
    );
  }

  test('MaybeAuthenticated renders children when token exists', () => {
    const useConvexAuthSpy = spyOn(
      convexReact,
      'useConvexAuth'
    ).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as any);

    try {
      const { queryByTestId } = render(
        <MaybeAuthenticated>
          <div data-testid="x">X</div>
        </MaybeAuthenticated>,
        { wrapper: makeAuthWrapper({ token: 'tok' }) }
      );

      expect(queryByTestId('x')).not.toBeNull();
    } finally {
      useConvexAuthSpy.mockRestore();
    }
  });

  test('MaybeUnauthenticated renders children when token is missing', () => {
    const useConvexAuthSpy = spyOn(
      convexReact,
      'useConvexAuth'
    ).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as any);

    try {
      const { queryByTestId } = render(
        <MaybeUnauthenticated>
          <div data-testid="x">X</div>
        </MaybeUnauthenticated>,
        { wrapper: makeAuthWrapper({ token: null }) }
      );

      expect(queryByTestId('x')).not.toBeNull();
    } finally {
      useConvexAuthSpy.mockRestore();
    }
  });

  test('Authenticated renders children only when authenticated', () => {
    const useConvexAuthSpy = spyOn(
      convexReact,
      'useConvexAuth'
    ).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as any);

    try {
      const { queryByTestId } = render(
        <Authenticated>
          <div data-testid="x">X</div>
        </Authenticated>,
        { wrapper: makeAuthWrapper({ token: 'tok' }) }
      );

      expect(queryByTestId('x')).not.toBeNull();
    } finally {
      useConvexAuthSpy.mockRestore();
    }
  });

  test('Unauthenticated renders children only when not loading and not authenticated', () => {
    const useConvexAuthSpy = spyOn(
      convexReact,
      'useConvexAuth'
    ).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as any);

    try {
      const { queryByTestId } = render(
        <Unauthenticated>
          <div data-testid="x">X</div>
        </Unauthenticated>,
        { wrapper: makeAuthWrapper({ token: 'tok' }) }
      );

      expect(queryByTestId('x')).not.toBeNull();
    } finally {
      useConvexAuthSpy.mockRestore();
    }
  });
});
