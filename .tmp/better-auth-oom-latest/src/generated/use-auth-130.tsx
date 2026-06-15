import { authClient } from "../auth-client.js";

export function UseAuth130() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth130() {
  await authClient.signIn.email({
    email: "user130@example.com",
    password: "password",
  });
  await authClient.signOut();
}
