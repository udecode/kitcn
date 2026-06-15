import { authClient } from "../auth-client.js";

export function UseAuth54() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth54() {
  await authClient.signIn.email({
    email: "user54@example.com",
    password: "password",
  });
  await authClient.signOut();
}
