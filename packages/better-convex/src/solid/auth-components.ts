import { createAuth } from './auth-store';

type AuthComponentProps = {
  children: unknown;
};

/** Render children only when maybe has auth (optimistic, has token) */
export function MaybeAuthenticated(props: AuthComponentProps) {
  const auth = createAuth();
  return () => (auth.hasSession ? props.children : undefined);
}

/** Render children only when authenticated (server-verified) */
export function Authenticated(props: AuthComponentProps) {
  const auth = createAuth();
  return () => (auth.isAuthenticated ? props.children : undefined);
}

/** Render children only when maybe not auth (optimistic) */
export function MaybeUnauthenticated(props: AuthComponentProps) {
  const auth = createAuth();
  return () => (auth.hasSession ? undefined : props.children);
}

/** Render children only when not authenticated (server-verified) */
export function Unauthenticated(props: AuthComponentProps) {
  const auth = createAuth();
  return () =>
    auth.isLoading || auth.isAuthenticated ? undefined : props.children;
}
