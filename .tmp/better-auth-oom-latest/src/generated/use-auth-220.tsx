import { authClient } from "../auth-client.js";

export function UseAuth220() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth220() {
  await authClient.signIn.email({
    email: "user220@example.com",
    password: "password",
  });
  await authClient.signOut();
}
