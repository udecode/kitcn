import { authClient } from "../auth-client.js";

export function UseAuth166() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth166() {
  await authClient.signIn.email({
    email: "user166@example.com",
    password: "password",
  });
  await authClient.signOut();
}
