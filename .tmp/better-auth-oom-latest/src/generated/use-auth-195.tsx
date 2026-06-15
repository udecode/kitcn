import { authClient } from "../auth-client.js";

export function UseAuth195() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth195() {
  await authClient.signIn.email({
    email: "user195@example.com",
    password: "password",
  });
  await authClient.signOut();
}
