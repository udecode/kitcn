import { authClient } from "../auth-client.js";

export function UseAuth99() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth99() {
  await authClient.signIn.email({
    email: "user99@example.com",
    password: "password",
  });
  await authClient.signOut();
}
