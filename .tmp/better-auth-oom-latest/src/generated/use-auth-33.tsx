import { authClient } from "../auth-client.js";

export function UseAuth33() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth33() {
  await authClient.signIn.email({
    email: "user33@example.com",
    password: "password",
  });
  await authClient.signOut();
}
