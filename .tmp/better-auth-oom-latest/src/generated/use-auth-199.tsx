import { authClient } from "../auth-client.js";

export function UseAuth199() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth199() {
  await authClient.signIn.email({
    email: "user199@example.com",
    password: "password",
  });
  await authClient.signOut();
}
