import { authClient } from "../auth-client.js";

export function UseAuth50() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth50() {
  await authClient.signIn.email({
    email: "user50@example.com",
    password: "password",
  });
  await authClient.signOut();
}
