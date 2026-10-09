import { betterFetch } from '@better-fetch/fetch';
import { getSessionCookie } from 'better-auth/cookies';
import type { Jwk } from 'better-auth/plugins/jwt';
import type { AuthProvider } from 'convex/server';
import * as jose from 'jose';
import { JWT_COOKIE_NAME } from './convex-plugin';
import { isTokenExpired, resolveConvexTokenPath } from './token-utils';

const STATIC_JWKS_CLEANUP_RE = /[\s\\]/g;

export type GetTokenOptions = {
  basePath?: string;
  cookiePrefix?: string;
  forceRefresh?: boolean;
  jwtCache?: {
    enabled: boolean;
    expirationToleranceSeconds?: number;
    isAuthError: (error: unknown) => boolean;
    /** Current Unix time in seconds. Defaults to the system clock. */
    now?: () => number | Promise<number>;
  };
};

export const getToken = async (
  siteUrl: string,
  headers: Headers,
  opts?: GetTokenOptions
) => {
  const fetchToken = async () => {
    const { data } = await betterFetch<{ token: string }>(
      resolveConvexTokenPath(opts?.basePath),
      {
        baseURL: siteUrl,
        headers,
      }
    );
    return { isFresh: true, token: data?.token };
  };

  if (!opts?.jwtCache?.enabled || opts.forceRefresh) {
    return await fetchToken();
  }

  const token = getSessionCookie(new Headers(headers), {
    cookieName: JWT_COOKIE_NAME,
    cookiePrefix: opts?.cookiePrefix,
  });
  if (!token) {
    return await fetchToken();
  }

  let claims: jose.JWTPayload;
  try {
    claims = jose.decodeJwt(token);
  } catch (error) {
    console.error('Error decoding JWT', error);
    return await fetchToken();
  }

  if (!claims.exp) {
    return await fetchToken();
  }

  let now: number | undefined;
  if (opts.jwtCache.now) {
    now = await opts.jwtCache.now();
    if (!Number.isFinite(now)) {
      throw new RangeError(
        'JWT cache now must return finite Unix time in seconds'
      );
    }
  }

  if (
    !isTokenExpired(
      claims.exp,
      opts.jwtCache.expirationToleranceSeconds ?? 60,
      now
    )
  ) {
    return { isFresh: false, token };
  }

  return await fetchToken();
};

export const parseJwks = (providerConfig: AuthProvider) => {
  const staticJwksString =
    'jwks' in providerConfig && providerConfig.jwks?.startsWith('data:text/')
      ? atob(providerConfig.jwks.split('base64,')[1]!)
      : undefined;

  if (!staticJwksString) {
    return;
  }

  const parsed = JSON.parse(
    staticJwksString?.slice(1, -1).replaceAll(STATIC_JWKS_CLEANUP_RE, '') ||
      '{}'
  );
  const staticJwks = {
    ...parsed,
    privateKey: `"${parsed.privateKey}"`,
    publicKey: `"${parsed.publicKey}"`,
  } as Jwk;

  return staticJwks;
};
