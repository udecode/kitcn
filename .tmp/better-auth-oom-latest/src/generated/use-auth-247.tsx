import { authClient } from "../auth-client.js";

export function UseAuth247() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth247() {
  await authClient.signIn.email({
    email: "user247@example.com",
    password: "password",
  });
  await authClient.signOut();
}
