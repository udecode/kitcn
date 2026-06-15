import { authClient } from "../auth-client.js";

export function UseAuth8() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth8() {
  await authClient.signIn.email({
    email: "user8@example.com",
    password: "password",
  });
  await authClient.signOut();
}
