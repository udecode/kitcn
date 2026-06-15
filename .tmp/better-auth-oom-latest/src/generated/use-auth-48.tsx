import { authClient } from "../auth-client.js";

export function UseAuth48() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth48() {
  await authClient.signIn.email({
    email: "user48@example.com",
    password: "password",
  });
  await authClient.signOut();
}
