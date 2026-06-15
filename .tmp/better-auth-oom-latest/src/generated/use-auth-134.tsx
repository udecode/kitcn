import { authClient } from "../auth-client.js";

export function UseAuth134() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth134() {
  await authClient.signIn.email({
    email: "user134@example.com",
    password: "password",
  });
  await authClient.signOut();
}
