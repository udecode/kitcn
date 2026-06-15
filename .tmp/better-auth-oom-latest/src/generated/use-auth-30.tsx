import { authClient } from "../auth-client.js";

export function UseAuth30() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth30() {
  await authClient.signIn.email({
    email: "user30@example.com",
    password: "password",
  });
  await authClient.signOut();
}
