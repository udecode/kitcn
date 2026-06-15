import { authClient } from "../auth-client.js";

export function UseAuth163() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth163() {
  await authClient.signIn.email({
    email: "user163@example.com",
    password: "password",
  });
  await authClient.signOut();
}
