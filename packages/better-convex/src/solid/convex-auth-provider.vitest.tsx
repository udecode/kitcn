/** @jsxImportSource solid-js */
/** biome-ignore-all lint/suspicious/noExplicitAny: testing */

import { render, renderHook, waitFor } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAuthStore, useFetchAccessToken } from './auth-store';
import { ConvexAuthProvider } from './convex-auth-provider';

const makeJwt = (expSecondsFromNow: number) => {
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  const payload = btoa(JSON.stringify({ exp }));
  return `x.${payload}.z`;
};

describe('ConvexAuthProvider', () => {
  let originalHref = window.location.href;

  beforeEach(() => {
    originalHref = window.location.href;
  });

  afterEach(() => {
    try {
      window.history.replaceState({}, '', originalHref);
    } catch {
      // Happy DOM may reject some URL transitions; don't let cleanup fail the suite.
    }
  });

  function makeSessionAccessor(data: unknown, isPending: boolean) {
    const [session] = createSignal({ data, isPending });
    return session;
  }

  test('provides fetchAccessToken that returns cached SSR token while session is pending', async () => {
    const initialToken = makeJwt(3600);

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const convexToken = vi.fn(async () => ({ data: { token: makeJwt(7200) } }));

    const authClient = {
      useSession: () => makeSessionAccessor(null, true),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: {
        oneTimeToken: {
          verify: async () => ({ data: {} }),
        },
      },
    };

    const wrapper = (props: { children: JSX.Element }) => (
      <ConvexAuthProvider
        authClient={authClient as any}
        client={client as any}
        initialToken={initialToken}
      >
        {props.children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result).toBe('function');

    const fetched = await result!({ forceRefreshToken: false });

    expect(fetched).toBe(initialToken);
    expect(convexToken).toHaveBeenCalledTimes(0);
  });

  test('passes throw=false when fetching a fresh token', async () => {
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const jwt = makeJwt(7200);
    const convexToken = vi.fn(async (_opts?: unknown) => ({
      data: { token: jwt },
    }));

    const authClient = {
      useSession: () =>
        makeSessionAccessor({ session: { id: 'session-1' } }, false),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = (props: { children: JSX.Element }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {props.children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result).toBe('function');

    const fetched = await result!({ forceRefreshToken: true });
    expect(fetched).toBe(jwt);

    expect(convexToken).toHaveBeenCalledTimes(1);
    expect(convexToken).toHaveBeenCalledWith({
      fetchOptions: { throw: false },
    });
  });

  test('deduplicates concurrent token fetches', async () => {
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const jwt = makeJwt(7200);
    const convexToken = vi.fn(async (_opts?: unknown) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { data: { token: jwt } };
    });

    const authClient = {
      useSession: () =>
        makeSessionAccessor({ session: { id: 'session-1' } }, false),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = (props: { children: JSX.Element }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {props.children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result).toBe('function');

    const tokens = await Promise.all([
      result!({ forceRefreshToken: false }),
      result!({ forceRefreshToken: false }),
    ]);
    expect(tokens).toEqual([jwt, jwt]);
    expect(convexToken).toHaveBeenCalledTimes(1);
  });

  test('treats empty session payload as unauthenticated', async () => {
    const initialToken = makeJwt(3600);
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const convexToken = vi.fn(async () => ({ data: { token: makeJwt(7200) } }));

    const authClient = {
      useSession: () => makeSessionAccessor({}, false),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = (props: { children: JSX.Element }) => (
      <ConvexAuthProvider
        authClient={authClient as any}
        client={client as any}
        initialToken={initialToken}
      >
        {props.children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result).toBe('function');

    const fetched = await result!({ forceRefreshToken: false });

    expect(fetched).toBeNull();
    expect(convexToken).toHaveBeenCalledTimes(0);
  });

  test('treats user-only payload as unauthenticated when session object is missing', async () => {
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const convexToken = vi.fn(async () => ({ data: { token: makeJwt(7200) } }));

    const authClient = {
      useSession: () => makeSessionAccessor({ user: { id: 'user-1' } }, false),
      convex: { token: convexToken },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    const wrapper = (props: { children: JSX.Element }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {props.children}
      </ConvexAuthProvider>
    );

    const { result } = renderHook(() => useFetchAccessToken(), { wrapper });
    expect(typeof result).toBe('function');

    const fetched = await result!({ forceRefreshToken: false });

    expect(fetched).toBeNull();
    expect(convexToken).toHaveBeenCalledTimes(0);
  });

  test('useAuth reports unauthenticated when session is confirmed missing, even with SSR token', async () => {
    const initialToken = makeJwt(3600);
    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const authClient = {
      useSession: () => makeSessionAccessor(null, false),
      convex: { token: async () => ({ data: {} }) },
      getSession: async () => null,
      updateSession: () => {},
      crossDomain: { oneTimeToken: { verify: async () => ({ data: {} }) } },
    };

    // Render a component that reads store reactively (Solid renderHook captures static snapshot)
    function AuthStateDisplay() {
      const store = useAuthStore();
      return (
        <div
          data-has-session={String(!!store.get('token'))}
          data-is-authenticated={String(store.get('isAuthenticated'))}
          data-is-loading={String(store.get('isLoading'))}
          data-testid="auth-state"
        />
      );
    }

    const { queryByTestId } = render(() => (
      <ConvexAuthProvider
        authClient={authClient as any}
        client={client as any}
        initialToken={initialToken}
      >
        <AuthStateDisplay />
      </ConvexAuthProvider>
    ));

    await waitFor(() => {
      const el = queryByTestId('auth-state');
      expect(el?.getAttribute('data-has-session')).toBe('false');
      expect(el?.getAttribute('data-is-authenticated')).toBe('false');
      expect(el?.getAttribute('data-is-loading')).toBe('false');
    });
  });

  test('verifies OTT and refreshes session, then removes ott from URL', async () => {
    const ott = 'OTT123';

    window.history.replaceState({}, '', `/?ott=${ott}`);
    let currentOtt = new URL(window.location.href).searchParams.get('ott');
    if (currentOtt !== ott) {
      try {
        window.location.href = `http://localhost/?ott=${ott}`;
      } catch {
        // Ignore
      }
      currentOtt = new URL(window.location.href).searchParams.get('ott');
    }
    expect(currentOtt).toBe(ott);

    const verify = vi.fn(async () => {
      expect(new URL(window.location.href).searchParams.get('ott')).toBeNull();
      return {
        data: { session: { token: 'SESSION_TOKEN' } },
      };
    });
    const getSession = vi.fn(async (_opts: any) => null);
    const updateSession = vi.fn(() => {});

    const client = {
      setAuth: () => {},
      clearAuth: () => {},
    };

    const authClient = {
      useSession: () => makeSessionAccessor(null, false),
      convex: { token: async () => ({ data: {} }) },
      getSession,
      updateSession,
      crossDomain: { oneTimeToken: { verify } },
    };

    const wrapper = (props: { children: JSX.Element }) => (
      <ConvexAuthProvider authClient={authClient as any} client={client as any}>
        {props.children}
      </ConvexAuthProvider>
    );

    renderHook(() => null, { wrapper });

    // Wait for the full onMount async OTT chain to complete
    await waitFor(() => {
      expect(updateSession).toHaveBeenCalled();
    });

    expect(verify).toHaveBeenCalledWith({ token: ott });
    expect(getSession).toHaveBeenCalledWith({
      fetchOptions: { headers: { Authorization: 'Bearer SESSION_TOKEN' } },
    });

    const url = new URL(window.location.href);
    expect(url.searchParams.get('ott')).toBeNull();
  });
});
