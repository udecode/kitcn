import { authClient } from "../auth-client.js";

export function UseAuth227() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth227() {
  await authClient.signIn.email({
    email: "user227@example.com",
    password: "password",
  });
  await authClient.signOut();
}
