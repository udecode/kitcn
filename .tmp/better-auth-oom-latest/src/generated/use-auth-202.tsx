import { authClient } from "../auth-client.js";

export function UseAuth202() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth202() {
  await authClient.signIn.email({
    email: "user202@example.com",
    password: "password",
  });
  await authClient.signOut();
}
