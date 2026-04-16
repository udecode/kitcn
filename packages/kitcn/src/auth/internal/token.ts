import { betterFetch } from '@better-fetch/fetch';
import { getSessionCookie } from 'better-auth/cookies';
import type { Jwk } from 'better-auth/plugins/jwt';
import type { AuthProvider } from 'convex/server';
import * as jose from 'jose';
import { JWT_COOKIE_NAME } from './convex-plugin';

const STATIC_JWKS_CLEANUP_RE = /[\s\\]/g;

export type GetTokenOptions = {
  cookiePrefix?: string;
  forceRefresh?: boolean;
  jwtCache?: {
    enabled: boolean;
    expirationToleranceSeconds?: number;
    isAuthError: (error: unknown) => boolean;
  };
};

export const getToken = async (
  siteUrl: string,
  headers: Headers,
  opts?: GetTokenOptions
) => {
  const fetchToken = async () => {
    const { data } = await betterFetch<{ token: string }>(
      '/api/auth/convex/token',
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

  try {
    const claims = jose.decodeJwt(token);
    const exp = claims?.exp;
    const now = Math.floor(Date.now() / 1000);
    const isExpired = exp
      ? now > exp + (opts?.jwtCache?.expirationToleranceSeconds ?? 60)
      : true;

    if (!isExpired) {
      return { isFresh: false, token };
    }
  } catch (error) {
    console.error('Error decoding JWT', error);
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
