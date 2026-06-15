import { authClient } from "../auth-client.js";

export function UseAuth57() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth57() {
  await authClient.signIn.email({
    email: "user57@example.com",
    password: "password",
  });
  await authClient.signOut();
}
