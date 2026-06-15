import { authClient } from "../auth-client.js";

export function UseAuth93() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth93() {
  await authClient.signIn.email({
    email: "user93@example.com",
    password: "password",
  });
  await authClient.signOut();
}
