import { authClient } from "../auth-client.js";

export function UseAuth224() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth224() {
  await authClient.signIn.email({
    email: "user224@example.com",
    password: "password",
  });
  await authClient.signOut();
}
