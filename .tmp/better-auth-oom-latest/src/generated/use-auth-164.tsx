import { authClient } from "../auth-client.js";

export function UseAuth164() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth164() {
  await authClient.signIn.email({
    email: "user164@example.com",
    password: "password",
  });
  await authClient.signOut();
}
