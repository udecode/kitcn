import { authClient } from "../auth-client.js";

export function UseAuth75() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth75() {
  await authClient.signIn.email({
    email: "user75@example.com",
    password: "password",
  });
  await authClient.signOut();
}
