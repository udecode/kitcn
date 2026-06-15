import { authClient } from "../auth-client.js";

export function UseAuth32() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth32() {
  await authClient.signIn.email({
    email: "user32@example.com",
    password: "password",
  });
  await authClient.signOut();
}
