import { authClient } from "../auth-client.js";

export function UseAuth45() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth45() {
  await authClient.signIn.email({
    email: "user45@example.com",
    password: "password",
  });
  await authClient.signOut();
}
