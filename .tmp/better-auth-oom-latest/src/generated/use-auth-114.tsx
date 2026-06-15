import { authClient } from "../auth-client.js";

export function UseAuth114() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth114() {
  await authClient.signIn.email({
    email: "user114@example.com",
    password: "password",
  });
  await authClient.signOut();
}
