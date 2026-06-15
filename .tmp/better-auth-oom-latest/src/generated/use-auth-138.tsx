import { authClient } from "../auth-client.js";

export function UseAuth138() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth138() {
  await authClient.signIn.email({
    email: "user138@example.com",
    password: "password",
  });
  await authClient.signOut();
}
