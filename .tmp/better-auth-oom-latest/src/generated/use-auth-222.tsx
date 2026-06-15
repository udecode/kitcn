import { authClient } from "../auth-client.js";

export function UseAuth222() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth222() {
  await authClient.signIn.email({
    email: "user222@example.com",
    password: "password",
  });
  await authClient.signOut();
}
