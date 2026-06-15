import { authClient } from "../auth-client.js";

export function UseAuth88() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth88() {
  await authClient.signIn.email({
    email: "user88@example.com",
    password: "password",
  });
  await authClient.signOut();
}
