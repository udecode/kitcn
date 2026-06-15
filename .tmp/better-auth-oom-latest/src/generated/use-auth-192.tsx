import { authClient } from "../auth-client.js";

export function UseAuth192() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth192() {
  await authClient.signIn.email({
    email: "user192@example.com",
    password: "password",
  });
  await authClient.signOut();
}
