import * as startServer from '@tanstack/react-start/server';
import { ConvexHttpClient } from 'convex/browser';
import * as convexNextjs from 'convex/nextjs';
import { makeFunctionReference } from 'convex/server';
import * as tokenModule from '../auth/internal/token';

import { convexBetterAuthReactStart } from './server';

const activeSpies: Array<{ mockRestore: () => void }> = [];

const trackSpy = <T extends { mockRestore: () => void }>(spy: T): T => {
  activeSpies.push(spy);
  return spy;
};

describe('auth/start token refresh', () => {
  afterEach(() => {
    for (const spy of activeSpies.splice(0)) {
      spy.mockRestore();
    }
  });

  test('retries with a fresh token when cached auth fails', async () => {
    const tokens = new WeakMap<ConvexHttpClient, string>();
    const query = mock(async (token?: string) => {
      if (token === 'stale-token') {
        const error = new Error('unauthorized');
        (error as Error & { code?: string }).code = 'UNAUTHORIZED';
        throw error;
      }
      return 'ok';
    });
    trackSpy(
      spyOn(ConvexHttpClient.prototype, 'setAuth').mockImplementation(function (
        this: ConvexHttpClient,
        token: string
      ) {
        tokens.set(this, token);
      })
    );
    trackSpy(
      spyOn(ConvexHttpClient.prototype, 'query').mockImplementation(
        async function (this: ConvexHttpClient) {
          return query(tokens.get(this));
        } as typeof ConvexHttpClient.prototype.query
      )
    );

    const getToken = mock(async (_siteUrl: string, _headers: Headers) => {
      if (getToken.mock.calls.length === 1) {
        return { isFresh: false, token: 'stale-token' };
      }
      return { isFresh: true, token: 'fresh-token' };
    });

    trackSpy(spyOn(tokenModule, 'getToken').mockImplementation(getToken));

    const request = new Request('https://app.example.com/');
    trackSpy(spyOn(startServer, 'getRequest').mockReturnValue(request));

    const serverMutation = mock(
      async (_ref: unknown, _args: unknown, options?: { token?: string }) => {
        if (options?.token === 'stale-token') {
          const error = new Error('unauthorized');
          (error as Error & { code?: string }).code = 'UNAUTHORIZED';
          throw error;
        }
        return 'ok';
      }
    );

    trackSpy(
      spyOn(convexNextjs, 'fetchAction').mockImplementation(
        serverMutation as typeof convexNextjs.fetchAction
      )
    );
    trackSpy(
      spyOn(convexNextjs, 'fetchMutation').mockImplementation(
        serverMutation as typeof convexNextjs.fetchMutation
      )
    );
    trackSpy(
      spyOn(convexNextjs, 'fetchQuery').mockImplementation(
        serverMutation as typeof convexNextjs.fetchQuery
      )
    );

    const mutationRef = makeFunctionReference<'mutation'>('todos:create');
    const api = {
      todos: {
        create: Object.assign(mutationRef, {
          functionRef: mutationRef,
          type: 'mutation',
        }),
      },
    } as const;

    const auth = convexBetterAuthReactStart({
      api,
      auth: {
        isUnauthorized: (error) =>
          (error as { code?: string } | undefined)?.code === 'UNAUTHORIZED',
      },
      convexSiteUrl: 'https://app.convex.site',
      convexUrl: 'https://app.convex.cloud',
    });

    const caller = auth.createCaller();
    await expect(caller.getToken()).resolves.toBe('stale-token');
    await expect(auth.fetchAuthQuery({} as never)).resolves.toBe('ok');
    await expect(caller.todos.create({})).resolves.toBe('ok');

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(2);
    expect(serverMutation).toHaveBeenCalledTimes(1);
  });
});
