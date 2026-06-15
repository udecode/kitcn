import { authClient } from "../auth-client.js";

export function UseAuth198() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth198() {
  await authClient.signIn.email({
    email: "user198@example.com",
    password: "password",
  });
  await authClient.signOut();
}
