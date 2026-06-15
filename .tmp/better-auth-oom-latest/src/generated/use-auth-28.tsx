import { authClient } from "../auth-client.js";

export function UseAuth28() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth28() {
  await authClient.signIn.email({
    email: "user28@example.com",
    password: "password",
  });
  await authClient.signOut();
}
