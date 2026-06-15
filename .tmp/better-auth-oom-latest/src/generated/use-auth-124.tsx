import { authClient } from "../auth-client.js";

export function UseAuth124() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth124() {
  await authClient.signIn.email({
    email: "user124@example.com",
    password: "password",
  });
  await authClient.signOut();
}
