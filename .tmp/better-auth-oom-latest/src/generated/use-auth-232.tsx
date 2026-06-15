import { authClient } from "../auth-client.js";

export function UseAuth232() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth232() {
  await authClient.signIn.email({
    email: "user232@example.com",
    password: "password",
  });
  await authClient.signOut();
}
