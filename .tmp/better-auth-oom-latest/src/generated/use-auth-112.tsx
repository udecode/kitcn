import { authClient } from "../auth-client.js";

export function UseAuth112() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth112() {
  await authClient.signIn.email({
    email: "user112@example.com",
    password: "password",
  });
  await authClient.signOut();
}
