import { authClient } from "../auth-client.js";

export function UseAuth66() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth66() {
  await authClient.signIn.email({
    email: "user66@example.com",
    password: "password",
  });
  await authClient.signOut();
}
