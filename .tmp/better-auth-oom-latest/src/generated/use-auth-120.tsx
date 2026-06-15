import { authClient } from "../auth-client.js";

export function UseAuth120() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth120() {
  await authClient.signIn.email({
    email: "user120@example.com",
    password: "password",
  });
  await authClient.signOut();
}
