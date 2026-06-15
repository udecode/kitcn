import { authClient } from "../auth-client.js";

export function UseAuth87() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth87() {
  await authClient.signIn.email({
    email: "user87@example.com",
    password: "password",
  });
  await authClient.signOut();
}
