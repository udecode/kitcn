import { authClient } from "../auth-client.js";

export function UseAuth216() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth216() {
  await authClient.signIn.email({
    email: "user216@example.com",
    password: "password",
  });
  await authClient.signOut();
}
