import { authClient } from "../auth-client.js";

export function UseAuth95() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth95() {
  await authClient.signIn.email({
    email: "user95@example.com",
    password: "password",
  });
  await authClient.signOut();
}
