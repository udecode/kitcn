import { authClient } from "../auth-client.js";

export function UseAuth31() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth31() {
  await authClient.signIn.email({
    email: "user31@example.com",
    password: "password",
  });
  await authClient.signOut();
}
