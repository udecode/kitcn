import { authClient } from "../auth-client.js";

export function UseAuth145() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth145() {
  await authClient.signIn.email({
    email: "user145@example.com",
    password: "password",
  });
  await authClient.signOut();
}
