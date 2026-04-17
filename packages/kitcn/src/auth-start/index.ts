import { stripIndent } from 'common-tags';
import { ConvexHttpClient } from 'convex/browser';
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from 'convex/server';
import React from 'react';
import { type GetTokenOptions, getToken } from '../auth/internal/token';

type ClientOptions = {
  convexSiteUrl: string;
  convexUrl: string;
  token?: string;
};

type ConvexBetterAuthReactStartOptions = Omit<
  GetTokenOptions,
  'forceRefresh'
> & {
  convexSiteUrl: string;
  convexUrl: string;
};

type ReactCache = <T extends (...args: never[]) => unknown>(fn: T) => T;

const fallbackCache: ReactCache = (fn) => fn;
const cache =
  (React as typeof React & { cache?: ReactCache }).cache ?? fallbackCache;

const TANSTACK_REACT_START_SERVER = '@tanstack/react-start/server';
const TRAILING_COLON_RE = /:$/;

function setupClient(options: ClientOptions) {
  const client = new ConvexHttpClient(options.convexUrl);
  if (options.token !== undefined) {
    client.setAuth(options.token);
  }
  (
    client as unknown as {
      setFetchOptions?: (options: RequestInit) => void;
    }
  ).setFetchOptions?.({ cache: 'no-store' });
  return client;
}

const parseConvexSiteUrl = (url: string) => {
  if (!url) {
    throw new Error(stripIndent`
      CONVEX_SITE_URL is not set.
      This is automatically set in the Convex backend, but must be set in the TanStack Start environment.
      For local development, this can be set in the .env.local file.
    `);
  }
  if (url.endsWith('.convex.cloud')) {
    throw new Error(stripIndent`
      CONVEX_SITE_URL should be set to your Convex Site URL, which ends in .convex.site.
      Currently set to ${url}.
    `);
  }
  return url;
};

const appendSetCookieHeaders = (target: Headers, source: Headers) => {
  const getSetCookie = (source as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;

  if (typeof getSetCookie === 'function') {
    const values = getSetCookie.call(source);
    for (const value of values) {
      target.append('set-cookie', value);
    }
    return;
  }

  const value = source.get('set-cookie');
  if (value) {
    target.append('set-cookie', value);
  }
};

const cloneAuthHandlerResponse = (response: Response) => {
  const headers = new Headers();

  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      continue;
    }
    headers.append(key, value);
  }

  appendSetCookieHeaders(headers, response.headers);

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

const handler = (
  request: Request,
  opts: { convexSiteUrl: string }
): Promise<Response> => {
  const requestUrl = new URL(request.url);
  const nextUrl = `${opts.convexSiteUrl}${requestUrl.pathname}${requestUrl.search}`;
  const headers = new Headers(request.headers);
  const proto = requestUrl.protocol.replace(TRAILING_COLON_RE, '');

  headers.set('accept-encoding', 'application/json');
  headers.set('host', new URL(opts.convexSiteUrl).host);
  headers.set('x-forwarded-host', requestUrl.host);
  headers.set('x-forwarded-proto', proto);
  headers.set('x-better-auth-forwarded-host', requestUrl.host);
  headers.set('x-better-auth-forwarded-proto', proto);

  return fetch(nextUrl, {
    body:
      request.method !== 'GET' && request.method !== 'HEAD'
        ? request.body
        : undefined,
    // Required by modern fetch implementations for streaming request bodies.
    duplex: 'half',
    headers,
    method: request.method,
    redirect: 'manual',
  } as RequestInit & { duplex: 'half' });
};

export const convexBetterAuthReactStart = (
  opts: ConvexBetterAuthReactStartOptions
) => {
  const siteUrl = parseConvexSiteUrl(opts.convexSiteUrl);

  const cachedGetToken = cache(async (opts: GetTokenOptions) => {
    const { getRequestHeaders } = (await import(
      TANSTACK_REACT_START_SERVER
    )) as {
      getRequestHeaders: () => HeadersInit;
    };
    const headers = getRequestHeaders();
    const mutableHeaders = new Headers(headers);
    mutableHeaders.delete('content-length');
    mutableHeaders.delete('transfer-encoding');
    mutableHeaders.set('accept-encoding', 'identity');
    return getToken(siteUrl, mutableHeaders, opts);
  });

  const callWithToken = async <
    FnType extends 'query' | 'mutation' | 'action',
    Fn extends FunctionReference<FnType>,
  >(
    fn: (token?: string) => Promise<FunctionReturnType<Fn>>
  ): Promise<FunctionReturnType<Fn>> => {
    const token = (await cachedGetToken(opts)) ?? {};
    try {
      return await fn(token?.token);
    } catch (error) {
      if (
        !opts?.jwtCache?.enabled ||
        token.isFresh ||
        !opts.jwtCache?.isAuthError(error)
      ) {
        throw error;
      }
      const newToken = await cachedGetToken({
        ...opts,
        forceRefresh: true,
      });
      return await fn(newToken.token);
    }
  };

  return {
    getToken: async () => {
      const token = await cachedGetToken(opts);
      return token.token;
    },
    handler: async (request: Request) =>
      cloneAuthHandlerResponse(await handler(request, opts)),
    fetchAuthQuery: async <Query extends FunctionReference<'query'>>(
      query: Query,
      ...args: OptionalRestArgs<Query>
    ): Promise<FunctionReturnType<Query>> => {
      return callWithToken((token?: string) => {
        const client = setupClient({ ...opts, token });
        return client.query(query, ...args);
      });
    },
    fetchAuthMutation: async <Mutation extends FunctionReference<'mutation'>>(
      mutation: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      return callWithToken((token?: string) => {
        const client = setupClient({ ...opts, token });
        return client.mutation(mutation, ...args);
      });
    },
    fetchAuthAction: async <Action extends FunctionReference<'action'>>(
      action: Action,
      ...args: OptionalRestArgs<Action>
    ): Promise<FunctionReturnType<Action>> => {
      return callWithToken((token?: string) => {
        const client = setupClient({ ...opts, token });
        return client.action(action, ...args);
      });
    },
  };
};
