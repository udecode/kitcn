import { authClient } from "../auth-client.js";

export function UseAuth22() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth22() {
  await authClient.signIn.email({
    email: "user22@example.com",
    password: "password",
  });
  await authClient.signOut();
}
