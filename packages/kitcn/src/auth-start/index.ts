export type MaybePromise<T> = Promise<T> | T;

export type StartLoaderAuthClient = {
  clearAuth: () => void;
  setAuth: (fetchToken: () => Promise<string | null>) => void;
};

export type StartLoaderServerHttpClient = {
  clearAuth?: () => void;
  setAuth: (token: string) => void;
};

export type StartLoaderConvexQueryClient = {
  convexClient: StartLoaderAuthClient;
  serverHttpClient?: StartLoaderServerHttpClient;
};

export type StartLoaderAuthTarget =
  | StartLoaderAuthClient
  | StartLoaderConvexQueryClient;

export type SyncConvexAuthForStartLoaderOptions = {
  convex: StartLoaderAuthTarget;
  getToken: () => MaybePromise<null | string | undefined>;
};

export type StartLoaderAuthState = {
  isAuthenticated: boolean;
  token: null | string;
};

const startLoaderAuthTokens = new WeakMap<object, null | string>();

const isStartLoaderConvexQueryClient = (
  target: StartLoaderAuthTarget
): target is StartLoaderConvexQueryClient => 'convexClient' in target;

export const syncConvexAuthForStartLoader = async ({
  convex,
  getToken,
}: SyncConvexAuthForStartLoaderOptions): Promise<StartLoaderAuthState> => {
  const authClient = isStartLoaderConvexQueryClient(convex)
    ? convex.convexClient
    : convex;
  const serverHttpClient = isStartLoaderConvexQueryClient(convex)
    ? convex.serverHttpClient
    : undefined;
  const token = (await getToken()) ?? null;
  const previousToken = startLoaderAuthTokens.get(convex);

  if (previousToken === token) {
    return { isAuthenticated: token !== null, token };
  }

  startLoaderAuthTokens.set(convex, token);

  if (token === null) {
    authClient.clearAuth();
    serverHttpClient?.clearAuth?.();
    return { isAuthenticated: false, token };
  }

  authClient.setAuth(async () => token);
  serverHttpClient?.setAuth(token);
  return { isAuthenticated: true, token };
};
