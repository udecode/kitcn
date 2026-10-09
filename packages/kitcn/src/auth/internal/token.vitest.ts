import { base64url } from 'jose';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { type GetTokenOptions, getToken } from './token';

const siteUrl = 'https://example.convex.site';
const isAuthError = () => false;
const jwt = (claims: Record<string, unknown>) =>
  `eyJhbGciOiJIUzI1NiJ9.${base64url.encode(JSON.stringify(claims))}.cHJvb2Y`;
const headersFor = (token: string) =>
  new Headers({ cookie: `better-auth.convex_jwt=${token}` });
const mockFetch = () => {
  const fetch = vi.fn(async () => Response.json({ token: 'refreshed-token' }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
const cacheOptions = (
  now: NonNullable<GetTokenOptions['jwtCache']>['now']
): GetTokenOptions => ({ jwtCache: { enabled: true, isAuthError, now } });

describe('JWT cache clock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('refreshes a JWT without expiry without reading the app clock', async () => {
    const fetch = mockFetch();
    const now = vi.fn(() => {
      throw new Error('clock should not be needed');
    });

    await expect(
      getToken(siteUrl, headersFor(jwt({ sub: 'user' })), cacheOptions(now))
    ).resolves.toEqual({ isFresh: true, token: 'refreshed-token' });
    expect(now).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  test.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects a non-finite app clock result (%s)', async (now) => {
    const fetch = mockFetch();
    const decodeError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      getToken(
        siteUrl,
        headersFor(jwt({ exp: 2000 })),
        cacheOptions(() => now)
      )
    ).rejects.toThrow(
      new RangeError('JWT cache now must return finite Unix time in seconds')
    );
    expect(decodeError).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    'disabled',
    'forced',
    'missing',
    'malformed',
  ])('refreshes a %s cache without reading the app clock', async (scenario) => {
    const fetch = mockFetch();
    const decodeError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const now = vi.fn(() => {
      throw new Error('clock should not be needed');
    });
    const token = scenario === 'malformed' ? 'invalid-jwt' : jwt({ exp: 2000 });
    const headers = scenario === 'missing' ? new Headers() : headersFor(token);

    await expect(
      getToken(siteUrl, headers, {
        forceRefresh: scenario === 'forced',
        jwtCache: { enabled: scenario !== 'disabled', isAuthError, now },
      })
    ).resolves.toEqual({ isFresh: true, token: 'refreshed-token' });
    expect(now).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(decodeError).toHaveBeenCalledTimes(scenario === 'malformed' ? 1 : 0);
  });

  test('fetches a token when cache options are omitted', async () => {
    const fetch = mockFetch();

    await expect(
      getToken(siteUrl, headersFor(jwt({ exp: 2000 })))
    ).resolves.toEqual({ isFresh: true, token: 'refreshed-token' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  test.each([
    { exp: 2059, tolerance: undefined, refresh: true },
    { exp: 2060, tolerance: undefined, refresh: true },
    { exp: 2061, tolerance: undefined, refresh: false },
    { exp: 2014, tolerance: 15, refresh: true },
    { exp: 2015, tolerance: 15, refresh: true },
    { exp: 2016, tolerance: 15, refresh: false },
    { exp: 2000, tolerance: 0, refresh: true },
    { exp: 2001, tolerance: 0, refresh: false },
  ])('applies tolerance $tolerance at expiry $exp with refresh $refresh', async ({
    exp,
    tolerance,
    refresh,
  }) => {
    const fetch = mockFetch();
    const token = jwt({ exp });

    await expect(
      getToken(siteUrl, headersFor(token), {
        jwtCache: {
          enabled: true,
          expirationToleranceSeconds: tolerance,
          isAuthError,
          now: () => 2000,
        },
      })
    ).resolves.toEqual({
      isFresh: refresh,
      token: refresh ? 'refreshed-token' : token,
    });
    expect(fetch).toHaveBeenCalledTimes(refresh ? 1 : 0);
  });

  test('waits for the app clock before returning a cached token', async () => {
    const fetch = mockFetch();
    let resolveClock: (now: number) => void = () => {};
    const clock = new Promise<number>((resolve) => {
      resolveClock = resolve;
    });
    const token = jwt({ exp: 2000 });
    let settled = false;
    const result = getToken(
      siteUrl,
      headersFor(token),
      cacheOptions(() => clock)
    );
    const observed = result.then((value) => {
      settled = true;
      return value;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    resolveClock(1000);
    await expect(observed).resolves.toEqual({ isFresh: false, token });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('propagates a synchronous clock failure without fetching or decode logging', async () => {
    const fetch = mockFetch();
    const decodeError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('clock failure');

    await expect(
      getToken(
        siteUrl,
        headersFor(jwt({ exp: 2000 })),
        cacheOptions(() => {
          throw error;
        })
      )
    ).rejects.toBe(error);
    expect(decodeError).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
