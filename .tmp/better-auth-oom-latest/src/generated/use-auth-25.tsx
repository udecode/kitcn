import { authClient } from "../auth-client.js";

export function UseAuth25() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth25() {
  await authClient.signIn.email({
    email: "user25@example.com",
    password: "password",
  });
  await authClient.signOut();
}
