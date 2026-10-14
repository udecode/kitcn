// The page state is browser only and lives on `globalThis`, so every built
// entry (`kitcn/auth/start` is bundled apart from `kitcn/auth/client` and
// `kitcn/react`) shares one copy. On the server, where one module serves many
// requests, it is never created, read or written. No imports, so loaders can
// use it too.

export type IdentityGuard = {
  guarded: boolean;
  baseline: () => string | null;
  hasGetter: boolean;
  identity: string | null;
  tripped: boolean;
  heldToken: () => string | null;
  onAdmitted: (token: string) => void;
};

/**
 * - `handout`: to Convex, HTTP headers or the loader. With an identity
 *   guard in play, an opaque session token never goes (it is only the
 *   exchange credential).
 * - `hold`: cached or published in a store; an opaque token may be held as
 *   the exchange credential.
 * - `restore`: a persisted token; an opaque one is not restored once an
 *   identity is established, because it proves none.
 */
export type TokenUse = 'handout' | 'hold' | 'restore';

type PageRegistry = {
  incompatible?: true;
  tripped: boolean;
  tripListeners: Set<() => void>;
  documentIdentity: string | null;
  guards: Set<IdentityGuard>;
  storeGuards: WeakMap<object, IdentityGuard>;
  settledClients: WeakSet<object>;
  settlementListeners: WeakMap<object, Set<() => void>>;
  watchedClients: WeakSet<object>;
};

const REGISTRY_KEY = Symbol.for('kitcn.identityGuard.v2');

const createRegistry = (): PageRegistry => ({
  documentIdentity: null,
  guards: new Set(),
  settledClients: new WeakSet(),
  settlementListeners: new WeakMap(),
  storeGuards: new WeakMap(),
  tripListeners: new Set(),
  tripped: false,
  watchedClients: new WeakSet(),
});

const isRegistry = (value: unknown): value is PageRegistry => {
  const candidate = value as Partial<PageRegistry> | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.tripped === 'boolean' &&
    (candidate.documentIdentity === null ||
      typeof candidate.documentIdentity === 'string') &&
    candidate.tripListeners instanceof Set &&
    candidate.guards instanceof Set &&
    candidate.storeGuards instanceof WeakMap &&
    candidate.settledClients instanceof WeakSet &&
    candidate.settlementListeners instanceof WeakMap &&
    candidate.watchedClients instanceof WeakSet
  );
};

let incompatibleStandIn: PageRegistry | undefined;

export const pageRegistry = (): PageRegistry | null => {
  if (typeof window === 'undefined') return null;
  const scope = globalThis as unknown as Record<symbol, unknown>;
  scope[REGISTRY_KEY] ??= createRegistry();
  const found = scope[REGISTRY_KEY];
  if (isRegistry(found)) return found;
  if (!incompatibleStandIn) {
    console.warn(
      '[kitcn] identity guard state of another kitcn revision is on this page; guarded providers hand out no token until the page reloads.'
    );
    incompatibleStandIn = { ...createRegistry(), incompatible: true };
  }
  return incompatibleStandIn;
};

export const isDocumentTripped = () => pageRegistry()?.tripped ?? false;

export const tripDocument = () => {
  const registry = pageRegistry();
  if (!registry || registry.tripped) return;
  registry.tripped = true;
  for (const listener of [...registry.tripListeners]) {
    try {
      listener();
    } catch (error) {
      console.error('[kitcn] identity guard trip listener threw', error);
    }
  }
};

export const subscribeDocumentTrip = (listener: () => void) => {
  const registry = pageRegistry();
  if (!registry) return () => {};
  registry.tripListeners.add(listener);
  return () => {
    registry.tripListeners.delete(listener);
  };
};

export const attachStoreGuard = (
  store: object | undefined,
  guard: IdentityGuard
) => {
  if (store) pageRegistry()?.storeGuards.set(store, guard);
};

export const storeGuard = (store: object | undefined) =>
  store ? pageRegistry()?.storeGuards.get(store) : undefined;

export const mountGuard = (guard: IdentityGuard) => {
  const registry = pageRegistry();
  if (!registry) return () => {};
  registry.guards.add(guard);
  joinPage(guard);
  return () => {
    registry.guards.delete(guard);
  };
};

export const joinPage = (guard: IdentityGuard) => {
  const registry = pageRegistry();
  if (!registry) return;
  if (guard.guarded && guard.identity) {
    registry.documentIdentity ??= guard.identity;
  }
  for (const mounted of [...registry.guards]) {
    const held = mounted.heldToken();
    if (held && isJwt(held) && !isTokenAdmissible(held, mounted, 'hold')) {
      tripDocument();
      break;
    }
  }
};

const guardedProviderMounted = () =>
  [...(pageRegistry()?.guards ?? [])].some((mounted) => mounted.guarded);

const boundIdentities = (guard: IdentityGuard | undefined) => {
  const registry = pageRegistry();
  const bound = [registry?.documentIdentity ?? null];
  if (guard?.guarded) bound.push(guard.identity, guard.baseline());
  for (const mounted of registry?.guards ?? []) {
    if (mounted.hasGetter) bound.push(mounted.baseline());
  }
  return bound.filter((identity): identity is string => identity !== null);
};

export const identityGuardInPlay = (guard: IdentityGuard | undefined) =>
  !!guard?.guarded ||
  boundIdentities(guard).length > 0 ||
  guardedProviderMounted();

export const isTokenAdmissible = (
  token: string,
  guard: IdentityGuard | undefined,
  use: TokenUse
) => {
  if (isDocumentTripped() || guard?.tripped) return false;
  if (guard?.guarded && pageRegistry()?.incompatible) return false;
  const bound = boundIdentities(guard);
  if (!isJwt(token)) {
    if (use === 'hold') return true;
    if (use === 'restore') return bound.length === 0;
    return !identityGuardInPlay(guard);
  }
  const identity = decodeTokenSubjectSessionIdentity(token);
  return identity === null
    ? bound.length === 0
    : bound.every((known) => known === identity);
};

export const admitToken = (
  token: string,
  {
    announce = false,
    guard,
    use,
  }: { announce?: boolean; guard?: IdentityGuard; use: TokenUse }
): boolean => {
  if (!isTokenAdmissible(token, guard, use)) {
    if (isJwt(token)) {
      if (guard) guard.tripped = true;
      tripDocument();
    }
    return false;
  }
  const identity = isJwt(token)
    ? decodeTokenSubjectSessionIdentity(token)
    : null;
  if (identity !== null && (guard?.guarded || guardedProviderMounted())) {
    if (guard?.guarded) guard.identity = identity;
    const registry = pageRegistry();
    if (registry) registry.documentIdentity ??= identity;
  }
  if (announce && guard?.guarded && isJwt(token)) {
    guard.onAdmitted(token);
    return admitToken(token, { guard, use });
  }
  return !isDocumentTripped() && !guard?.tripped;
};

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[1]) return null;
  try {
    const payload: unknown = JSON.parse(
      atob(segments[1].replaceAll('-', '+').replaceAll('_', '/'))
    );
    return typeof payload === 'object' &&
      payload !== null &&
      !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const isJwt = (token: string) => decodeJwtClaims(token) !== null;

/**
 * The user and session a Better Auth Convex JWT speaks for (`sub` and
 * `sessionId`), or null. Other claims (name, email, updatedAt) may change
 * within one session and do not count.
 */
export function decodeTokenSubjectSessionIdentity(
  token: string | null
): string | null {
  const claims = token ? decodeJwtClaims(token) : null;
  if (!claims || typeof claims.sub !== 'string') return null;
  const sessionId =
    typeof claims.sessionId === 'string' ? claims.sessionId : '';
  return `${claims.sub}|${sessionId}`;
}

export const resetDocumentTripForTests = () => {
  const registry = pageRegistry();
  if (!registry) return;
  registry.tripped = false;
  registry.documentIdentity = null;
};
