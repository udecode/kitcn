import { authClient } from "../auth-client.js";

export function UseAuth61() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth61() {
  await authClient.signIn.email({
    email: "user61@example.com",
    password: "password",
  });
  await authClient.signOut();
}
