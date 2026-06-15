import { authClient } from "../auth-client.js";

export function UseAuth204() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth204() {
  await authClient.signIn.email({
    email: "user204@example.com",
    password: "password",
  });
  await authClient.signOut();
}
