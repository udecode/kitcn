import { authClient } from "../auth-client.js";

export function UseAuth229() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth229() {
  await authClient.signIn.email({
    email: "user229@example.com",
    password: "password",
  });
  await authClient.signOut();
}
