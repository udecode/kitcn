import { authClient } from "../auth-client.js";

export function UseAuth89() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth89() {
  await authClient.signIn.email({
    email: "user89@example.com",
    password: "password",
  });
  await authClient.signOut();
}
