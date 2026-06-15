import { authClient } from "../auth-client.js";

export function UseAuth125() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth125() {
  await authClient.signIn.email({
    email: "user125@example.com",
    password: "password",
  });
  await authClient.signOut();
}
