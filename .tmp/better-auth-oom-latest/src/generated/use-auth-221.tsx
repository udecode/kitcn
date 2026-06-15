import { authClient } from "../auth-client.js";

export function UseAuth221() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth221() {
  await authClient.signIn.email({
    email: "user221@example.com",
    password: "password",
  });
  await authClient.signOut();
}
