import { authClient } from "../auth-client.js";

export function UseAuth14() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth14() {
  await authClient.signIn.email({
    email: "user14@example.com",
    password: "password",
  });
  await authClient.signOut();
}
