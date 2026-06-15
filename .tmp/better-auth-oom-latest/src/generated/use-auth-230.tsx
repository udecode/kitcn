import { authClient } from "../auth-client.js";

export function UseAuth230() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth230() {
  await authClient.signIn.email({
    email: "user230@example.com",
    password: "password",
  });
  await authClient.signOut();
}
