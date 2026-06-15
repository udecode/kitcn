import { authClient } from "../auth-client.js";

export function UseAuth67() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth67() {
  await authClient.signIn.email({
    email: "user67@example.com",
    password: "password",
  });
  await authClient.signOut();
}
