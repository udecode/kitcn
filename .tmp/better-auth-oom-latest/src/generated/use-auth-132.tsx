import { authClient } from "../auth-client.js";

export function UseAuth132() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth132() {
  await authClient.signIn.email({
    email: "user132@example.com",
    password: "password",
  });
  await authClient.signOut();
}
