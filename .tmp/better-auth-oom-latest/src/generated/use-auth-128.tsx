import { authClient } from "../auth-client.js";

export function UseAuth128() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth128() {
  await authClient.signIn.email({
    email: "user128@example.com",
    password: "password",
  });
  await authClient.signOut();
}
