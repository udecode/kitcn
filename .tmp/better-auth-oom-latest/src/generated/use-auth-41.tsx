import { authClient } from "../auth-client.js";

export function UseAuth41() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth41() {
  await authClient.signIn.email({
    email: "user41@example.com",
    password: "password",
  });
  await authClient.signOut();
}
