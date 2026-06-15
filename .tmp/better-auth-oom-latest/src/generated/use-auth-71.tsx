import { authClient } from "../auth-client.js";

export function UseAuth71() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth71() {
  await authClient.signIn.email({
    email: "user71@example.com",
    password: "password",
  });
  await authClient.signOut();
}
