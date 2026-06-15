import { authClient } from "../auth-client.js";

export function UseAuth218() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth218() {
  await authClient.signIn.email({
    email: "user218@example.com",
    password: "password",
  });
  await authClient.signOut();
}
