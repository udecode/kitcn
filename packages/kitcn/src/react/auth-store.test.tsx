import {
  act,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react';
import * as convexReact from 'convex/react';
import { type ReactNode, useState } from 'react';
import {
  Authenticated,
  AuthProvider,
  ConvexAuthBridge,
  ConvexProviderWithAuth,
  decodeJwtExp,
  MaybeAuthenticated,
  MaybeUnauthenticated,
  Unauthenticated,
  useAuth,
  useAuthGuard,
  useConvexAuthRecovery,
  useSafeConvexAuth,
} from './auth-store';

const makeJwt = (payload: Record<string, unknown>) => {
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' })
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
};

type RecoveryBinding = {
  fetchToken: (args: { forceRefreshToken: boolean }) => Promise<string | null>;
  onChange: (isAuthenticated: boolean) => void;
};

function RecoveryProbe({
  capture,
}: {
  capture: (recovery: ReturnType<typeof useConvexAuthRecovery>) => void;
}) {
  capture(useConvexAuthRecovery());
  return null;
}

function StatefulRecoveryChild() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount((value) => value + 1)}>{count}</button>
  );
}

const renderRecoveryHarness = (children?: ReactNode) => {
  const bindings: RecoveryBinding[] = [];
  const client = {
    clearAuth: mock(() => {}),
    setAuth: mock(
      (
        fetchToken: RecoveryBinding['fetchToken'],
        onChange: RecoveryBinding['onChange']
      ) => {
        bindings.push({ fetchToken, onChange });
      }
    ),
  };
  const authState = {
    fetchAccessToken: mock(async () => 'token'),
    isAuthenticated: true,
    isLoading: false,
  };
  const useExternalAuth = () => authState;
  let recovery: ReturnType<typeof useConvexAuthRecovery> | undefined;
  const tree = () => (
    <ConvexProviderWithAuth client={client as never} useAuth={useExternalAuth}>
      <RecoveryProbe
        capture={(nextRecovery) => {
          recovery = nextRecovery;
        }}
      />
      {children}
    </ConvexProviderWithAuth>
  );
  const view = render(tree());

  return {
    authState,
    bindings,
    client,
    get recovery() {
      if (!recovery) {
        throw new Error('Recovery probe has not rendered');
      }
      return recovery;
    },
    rerender: () => view.rerender(tree()),
    unmount: view.unmount,
    view,
  };
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

  test('useAuth (kitcn AuthProvider): hasSession reflects token and reads auth state from the synced store', () => {
    const wrapper = makeAuthWrapper({
      token: 'tok',
      isAuthenticated: false,
      isLoading: true,
    });
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toEqual({
      hasSession: true,
      isAuthenticated: false,
      isLoading: true,
    });
  });

  test('kitcn AuthProvider keeps loading while store says token is still syncing', () => {
    const useConvexAuthSpy = spyOn(
      convexReact,
      'useConvexAuth'
    ).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as any);

    try {
      const wrapper = makeAuthWrapper({
        token: 'tok',
        isAuthenticated: false,
        isLoading: true,
      });

      const { result: safeAuth } = renderHook(() => useSafeConvexAuth(), {
        wrapper,
      });
      expect(safeAuth.current).toEqual({
        isAuthenticated: false,
        isLoading: true,
      });

      const { result: auth } = renderHook(() => useAuth(), { wrapper });
      expect(auth.current).toEqual({
        hasSession: true,
        isAuthenticated: false,
        isLoading: true,
      });
    } finally {
      useConvexAuthSpy.mockRestore();
    }
  });
});

describe('ConvexProviderWithAuth recovery', () => {
  test('stays unauthenticated after terminal auth failure when the provider binding is stable', async () => {
    const bindings: Array<{
      fetchToken: (args: {
        forceRefreshToken: boolean;
      }) => Promise<string | null>;
      onChange: (isAuthenticated: boolean) => void;
    }> = [];
    const client = {
      clearAuth: mock(() => {}),
      setAuth: mock(
        (
          fetchToken: (args: {
            forceRefreshToken: boolean;
          }) => Promise<string | null>,
          onChange: (isAuthenticated: boolean) => void
        ) => {
          bindings.push({ fetchToken, onChange });
        }
      ),
    };
    const fetchAccessToken = mock(async () => 'token');
    const useExternalAuth = () => ({
      fetchAccessToken,
      isAuthenticated: true,
      isLoading: false,
    });

    function AuthProbe() {
      const auth = useSafeConvexAuth();
      return (
        <output>{auth.isAuthenticated ? 'authenticated' : 'noAuth'}</output>
      );
    }

    const view = render(
      <ConvexProviderWithAuth
        client={client as never}
        useAuth={useExternalAuth}
      >
        <AuthProbe />
      </ConvexProviderWithAuth>
    );

    await waitFor(() => {
      expect(bindings).toHaveLength(1);
    });
    act(() => {
      bindings[0]!.onChange(true);
    });
    expect(view.getByText('authenticated')).toBeTruthy();

    act(() => {
      bindings[0]!.onChange(false);
    });
    view.rerender(
      <ConvexProviderWithAuth
        client={client as never}
        useAuth={useExternalAuth}
      >
        <AuthProbe />
      </ConvexProviderWithAuth>
    );

    expect(view.getByText('noAuth')).toBeTruthy();
    expect(client.setAuth).toHaveBeenCalledTimes(1);
  });

  test('rebinds through the provider and resolves after backend confirmation', async () => {
    const harness = renderRecoveryHarness();

    await waitFor(() => {
      expect(harness.bindings).toHaveLength(1);
    });
    act(() => {
      harness.bindings[0]!.onChange(false);
    });

    let recovered!: Promise<void>;
    act(() => {
      recovered = harness.recovery.recover({ timeoutMs: 1_000 });
    });
    expect(harness.recovery.status).toBe('recovering');
    await waitFor(() => {
      expect(harness.bindings).toHaveLength(2);
    });
    await harness.bindings[1]!.fetchToken({ forceRefreshToken: false });
    act(() => {
      harness.bindings[1]!.onChange(true);
    });

    await expect(recovered).resolves.toBeUndefined();
    expect(harness.recovery.status).toBe('idle');
  });

  test('deduplicates concurrent recovery requests', async () => {
    const harness = renderRecoveryHarness();

    await waitFor(() => {
      expect(harness.bindings).toHaveLength(1);
    });
    act(() => {
      harness.bindings[0]!.onChange(false);
    });

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = harness.recovery.recover({ timeoutMs: 1_000 });
      second = harness.recovery.recover({ timeoutMs: 1_000 });
    });

    expect(second).toBe(first);
    await waitFor(() => {
      expect(harness.bindings).toHaveLength(2);
    });
    await harness.bindings[1]!.fetchToken({ forceRefreshToken: false });
    act(() => {
      harness.bindings[1]!.onChange(true);
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(harness.client.setAuth).toHaveBeenCalledTimes(2);
  });

  test('uses the latest token fetcher instead of replaying the failed binding', async () => {
    const harness = renderRecoveryHarness();

    await waitFor(() => {
      expect(harness.bindings).toHaveLength(1);
    });
    act(() => {
      harness.bindings[0]!.onChange(false);
    });

    const fetchAccessToken = mock(async () => 'fresh-token');
    harness.authState.fetchAccessToken = fetchAccessToken;

    let recovered!: Promise<void>;
    act(() => {
      recovered = harness.recovery.recover({ timeoutMs: 1_000 });
    });
    await waitFor(() => {
      expect(harness.bindings).toHaveLength(2);
    });

    await expect(
      harness.bindings[1]!.fetchToken({ forceRefreshToken: true })
    ).resolves.toBe('fresh-token');
    expect(fetchAccessToken).toHaveBeenCalledWith({
      forceRefreshToken: true,
    });
    act(() => {
      harness.bindings[1]!.onChange(true);
    });

    await expect(recovered).resolves.toBeUndefined();
  });

  test('rejects when Convex denies the replacement binding', async () => {
    const harness = renderRecoveryHarness();

    await waitFor(() => {
      expect(harness.bindings).toHaveLength(1);
    });
    act(() => {
      harness.bindings[0]!.onChange(false);
    });

    let recovered!: Promise<void>;
    act(() => {
      recovered = harness.recovery.recover({ timeoutMs: 1_000 });
    });
    const outcome = recovered.catch((error: unknown) => error);
    await waitFor(() => {
      expect(harness.bindings).toHaveLength(2);
    });
    await harness.bindings[1]!.fetchToken({ forceRefreshToken: false });
    act(() => {
      harness.bindings[1]!.onChange(false);
    });

    await expect(outcome).resolves.toMatchObject({
      code: 'AUTH_RECOVERY_FAILED',
    });
    expect(harness.recovery.status).toBe('failed');
  });

  test('preserves child state while replacing the auth binding', async () => {
    const harness = renderRecoveryHarness(<StatefulRecoveryChild />);

    await waitFor(() => {
      expect(harness.bindings).toHaveLength(1);
    });
    fireEvent.click(harness.view.getByRole('button'));
    expect(harness.view.getByRole('button').textContent).toBe('1');
    act(() => {
      harness.bindings[0]!.onChange(false);
    });

    let recovered!: Promise<void>;
    act(() => {
      recovered = harness.recovery.recover({ timeoutMs: 1_000 });
    });
    await waitFor(() => {
      expect(harness.bindings).toHaveLength(2);
    });

    expect(harness.view.getByRole('button').textContent).toBe('1');
    await harness.bindings[1]!.fetchToken({ forceRefreshToken: false });
    act(() => {
      harness.bindings[1]!.onChange(true);
    });
    await expect(recovered).resolves.toBeUndefined();
  });

  test('rejects recovery while the auth provider is loading', async () => {
    const harness = renderRecoveryHarness();

    act(() => {
      harness.authState.isLoading = true;
      harness.rerender();
    });

    let outcome!: Promise<unknown>;
    act(() => {
      outcome = harness.recovery.recover().catch((error: unknown) => error);
    });

    await expect(outcome).resolves.toMatchObject({
      code: 'AUTH_PROVIDER_LOADING',
    });
    expect(harness.recovery.status).toBe('failed');
  });

  test('rejects recovery without an authenticated provider session', async () => {
    const harness = renderRecoveryHarness();

    act(() => {
      harness.authState.isAuthenticated = false;
      harness.rerender();
    });

    let outcome!: Promise<unknown>;
    act(() => {
      outcome = harness.recovery.recover().catch((error: unknown) => error);
    });

    await expect(outcome).resolves.toMatchObject({
      code: 'AUTH_PROVIDER_UNAUTHENTICATED',
    });
    expect(harness.recovery.status).toBe('failed');
  });

  test('fails with a typed timeout when Convex never confirms recovery', async () => {
    const harness = renderRecoveryHarness();

    await waitFor(() => {
      expect(harness.bindings).toHaveLength(1);
    });
    act(() => {
      harness.bindings[0]!.onChange(false);
    });

    let recovered!: Promise<void>;
    act(() => {
      recovered = harness.recovery.recover({ timeoutMs: 5 });
    });
    let recoveryError: unknown;
    await act(async () => {
      recoveryError = await recovered.catch((error: unknown) => error);
    });

    expect(recoveryError).toMatchObject({
      code: 'AUTH_RECOVERY_TIMEOUT',
      name: 'ConvexAuthRecoveryError',
    });
    expect(harness.recovery.status).toBe('failed');
    expect(harness.recovery.error?.code).toBe('AUTH_RECOVERY_TIMEOUT');
  });

  test('retries successfully when Convex remains loading after a timeout', async () => {
    const harness = renderRecoveryHarness();

    await waitFor(() => {
      expect(harness.bindings).toHaveLength(1);
    });
    act(() => {
      harness.bindings[0]!.onChange(false);
    });

    let first!: Promise<void>;
    act(() => {
      first = harness.recovery.recover({ timeoutMs: 5 });
    });
    await waitFor(() => {
      expect(harness.bindings).toHaveLength(2);
    });
    await harness.bindings[1]!.fetchToken({ forceRefreshToken: false });
    await act(async () => {
      await first.catch(() => undefined);
    });

    let second!: Promise<void>;
    act(() => {
      second = harness.recovery.recover({ timeoutMs: 1_000 });
      harness.bindings[1]!.onChange(true);
    });
    let secondSettled = false;
    void second.then(
      () => {
        secondSettled = true;
      },
      () => {
        secondSettled = true;
      }
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(secondSettled).toBe(false);

    await waitFor(() => {
      expect(harness.bindings).toHaveLength(3);
    });
    await harness.bindings[2]!.fetchToken({ forceRefreshToken: false });
    act(() => {
      harness.bindings[2]!.onChange(true);
    });

    await expect(second).resolves.toBeUndefined();
  });

  test('fails recovery when the auth provider logs out', async () => {
    const harness = renderRecoveryHarness();

    await waitFor(() => {
      expect(harness.bindings).toHaveLength(1);
    });
    act(() => {
      harness.bindings[0]!.onChange(false);
    });

    let recovered!: Promise<void>;
    act(() => {
      recovered = harness.recovery.recover({ timeoutMs: 1_000 });
    });
    const outcome = recovered.catch((error: unknown) => error);
    await waitFor(() => {
      expect(harness.bindings).toHaveLength(2);
    });
    act(() => {
      harness.authState.isAuthenticated = false;
      harness.rerender();
    });

    await expect(outcome).resolves.toMatchObject({
      code: 'AUTH_PROVIDER_UNAUTHENTICATED',
    });
    expect(harness.recovery.status).toBe('failed');
  });

  test('cancels pending recovery when the provider unmounts', async () => {
    const harness = renderRecoveryHarness();

    await waitFor(() => {
      expect(harness.bindings).toHaveLength(1);
    });
    act(() => {
      harness.bindings[0]!.onChange(false);
    });

    let recovered!: Promise<void>;
    act(() => {
      recovered = harness.recovery.recover({ timeoutMs: 1_000 });
    });
    const outcome = recovered.catch((error: unknown) => error);
    act(() => {
      harness.unmount();
    });

    await expect(outcome).resolves.toMatchObject({
      code: 'AUTH_RECOVERY_CANCELLED',
    });
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
    const onMutationUnauthorized = mock(() => {});
    const wrapper = makeAuthWrapper({
      token: 'tok',
      isAuthenticated: false,
      isLoading: false,
      onMutationUnauthorized,
    });

    const { result } = renderHook(() => useAuthGuard(), { wrapper });

    expect(result.current()).toBe(true);
    expect(onMutationUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('runs callback and returns false/undefined when authenticated', () => {
    const wrapper = makeAuthWrapper({
      token: 'tok',
      isAuthenticated: true,
      isLoading: false,
    });
    const callback = mock(() => {});

    const { result } = renderHook(() => useAuthGuard(), { wrapper });

    expect(result.current()).toBe(false);
    expect(result.current(callback as any)).toBeUndefined();
    expect(callback).toHaveBeenCalledTimes(1);
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
    const { queryByTestId } = render(
      <Authenticated>
        <div data-testid="x">X</div>
      </Authenticated>,
      {
        wrapper: makeAuthWrapper({
          token: 'tok',
          isAuthenticated: true,
          isLoading: false,
        }),
      }
    );

    expect(queryByTestId('x')).not.toBeNull();
  });

  test('Unauthenticated renders children only when not loading and not authenticated', () => {
    const { queryByTestId } = render(
      <Unauthenticated>
        <div data-testid="x">X</div>
      </Unauthenticated>,
      {
        wrapper: makeAuthWrapper({
          token: 'tok',
          isAuthenticated: false,
          isLoading: false,
        }),
      }
    );

    expect(queryByTestId('x')).not.toBeNull();
  });
});
