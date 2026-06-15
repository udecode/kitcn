import { authClient } from "../auth-client.js";

export function UseAuth98() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth98() {
  await authClient.signIn.email({
    email: "user98@example.com",
    password: "password",
  });
  await authClient.signOut();
}
