import { authClient } from "../auth-client.js";

export function UseAuth194() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth194() {
  await authClient.signIn.email({
    email: "user194@example.com",
    password: "password",
  });
  await authClient.signOut();
}
