import { authClient } from "../auth-client.js";

export function UseAuth21() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth21() {
  await authClient.signIn.email({
    email: "user21@example.com",
    password: "password",
  });
  await authClient.signOut();
}
