import { convexBetterAuthReactStart as baseConvexBetterAuthReactStart } from '@convex-dev/better-auth/react-start';

export * from '@convex-dev/better-auth/react-start';

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

export const convexBetterAuthReactStart: typeof baseConvexBetterAuthReactStart =
  ((...args: Parameters<typeof baseConvexBetterAuthReactStart>) => {
    const auth = baseConvexBetterAuthReactStart(...args);

    return {
      ...auth,
      handler: async (request: Request) =>
        cloneAuthHandlerResponse(await auth.handler(request)),
    };
  }) as typeof baseConvexBetterAuthReactStart;
