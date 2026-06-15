import { authClient } from "../auth-client.js";

export function UseAuth44() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth44() {
  await authClient.signIn.email({
    email: "user44@example.com",
    password: "password",
  });
  await authClient.signOut();
}
