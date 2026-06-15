import { authClient } from "../auth-client.js";

export function UseAuth2() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth2() {
  await authClient.signIn.email({
    email: "user2@example.com",
    password: "password",
  });
  await authClient.signOut();
}
