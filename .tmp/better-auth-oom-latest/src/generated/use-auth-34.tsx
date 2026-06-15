import { authClient } from "../auth-client.js";

export function UseAuth34() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth34() {
  await authClient.signIn.email({
    email: "user34@example.com",
    password: "password",
  });
  await authClient.signOut();
}
