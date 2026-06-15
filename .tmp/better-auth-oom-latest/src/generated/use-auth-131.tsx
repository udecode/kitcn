import { authClient } from "../auth-client.js";

export function UseAuth131() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth131() {
  await authClient.signIn.email({
    email: "user131@example.com",
    password: "password",
  });
  await authClient.signOut();
}
