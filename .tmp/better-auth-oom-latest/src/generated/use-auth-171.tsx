import { authClient } from "../auth-client.js";

export function UseAuth171() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth171() {
  await authClient.signIn.email({
    email: "user171@example.com",
    password: "password",
  });
  await authClient.signOut();
}
