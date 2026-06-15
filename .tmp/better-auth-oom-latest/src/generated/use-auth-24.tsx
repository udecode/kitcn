import { authClient } from "../auth-client.js";

export function UseAuth24() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth24() {
  await authClient.signIn.email({
    email: "user24@example.com",
    password: "password",
  });
  await authClient.signOut();
}
