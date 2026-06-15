import { authClient } from "../auth-client.js";

export function UseAuth249() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth249() {
  await authClient.signIn.email({
    email: "user249@example.com",
    password: "password",
  });
  await authClient.signOut();
}
