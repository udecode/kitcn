import { authClient } from "../auth-client.js";

export function UseAuth197() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth197() {
  await authClient.signIn.email({
    email: "user197@example.com",
    password: "password",
  });
  await authClient.signOut();
}
