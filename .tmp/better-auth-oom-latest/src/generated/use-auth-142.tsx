import { authClient } from "../auth-client.js";

export function UseAuth142() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth142() {
  await authClient.signIn.email({
    email: "user142@example.com",
    password: "password",
  });
  await authClient.signOut();
}
