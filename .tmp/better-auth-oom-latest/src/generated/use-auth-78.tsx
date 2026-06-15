import { authClient } from "../auth-client.js";

export function UseAuth78() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth78() {
  await authClient.signIn.email({
    email: "user78@example.com",
    password: "password",
  });
  await authClient.signOut();
}
