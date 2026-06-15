import { authClient } from "../auth-client.js";

export function UseAuth65() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth65() {
  await authClient.signIn.email({
    email: "user65@example.com",
    password: "password",
  });
  await authClient.signOut();
}
