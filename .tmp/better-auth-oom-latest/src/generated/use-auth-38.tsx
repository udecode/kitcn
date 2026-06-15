import { authClient } from "../auth-client.js";

export function UseAuth38() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth38() {
  await authClient.signIn.email({
    email: "user38@example.com",
    password: "password",
  });
  await authClient.signOut();
}
