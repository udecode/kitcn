import { authClient } from "../auth-client.js";

export function UseAuth211() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth211() {
  await authClient.signIn.email({
    email: "user211@example.com",
    password: "password",
  });
  await authClient.signOut();
}
