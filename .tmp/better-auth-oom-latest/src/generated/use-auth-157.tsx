import { authClient } from "../auth-client.js";

export function UseAuth157() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth157() {
  await authClient.signIn.email({
    email: "user157@example.com",
    password: "password",
  });
  await authClient.signOut();
}
