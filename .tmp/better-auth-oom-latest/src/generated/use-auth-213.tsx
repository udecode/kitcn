import { authClient } from "../auth-client.js";

export function UseAuth213() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth213() {
  await authClient.signIn.email({
    email: "user213@example.com",
    password: "password",
  });
  await authClient.signOut();
}
