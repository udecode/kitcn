import { authClient } from "../auth-client.js";

export function UseAuth27() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth27() {
  await authClient.signIn.email({
    email: "user27@example.com",
    password: "password",
  });
  await authClient.signOut();
}
