import { authClient } from "../auth-client.js";

export function UseAuth219() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth219() {
  await authClient.signIn.email({
    email: "user219@example.com",
    password: "password",
  });
  await authClient.signOut();
}
