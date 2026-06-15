import { authClient } from "../auth-client.js";

export function UseAuth96() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth96() {
  await authClient.signIn.email({
    email: "user96@example.com",
    password: "password",
  });
  await authClient.signOut();
}
