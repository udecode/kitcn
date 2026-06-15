import { authClient } from "../auth-client.js";

export function UseAuth64() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth64() {
  await authClient.signIn.email({
    email: "user64@example.com",
    password: "password",
  });
  await authClient.signOut();
}
