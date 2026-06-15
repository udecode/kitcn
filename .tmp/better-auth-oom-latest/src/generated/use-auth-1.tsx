import { authClient } from "../auth-client.js";

export function UseAuth1() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth1() {
  await authClient.signIn.email({
    email: "user1@example.com",
    password: "password",
  });
  await authClient.signOut();
}
