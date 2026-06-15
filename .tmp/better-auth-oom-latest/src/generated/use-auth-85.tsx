import { authClient } from "../auth-client.js";

export function UseAuth85() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth85() {
  await authClient.signIn.email({
    email: "user85@example.com",
    password: "password",
  });
  await authClient.signOut();
}
