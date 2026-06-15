import { authClient } from "../auth-client.js";

export function UseAuth208() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth208() {
  await authClient.signIn.email({
    email: "user208@example.com",
    password: "password",
  });
  await authClient.signOut();
}
