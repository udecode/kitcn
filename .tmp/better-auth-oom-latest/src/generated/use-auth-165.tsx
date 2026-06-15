import { authClient } from "../auth-client.js";

export function UseAuth165() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth165() {
  await authClient.signIn.email({
    email: "user165@example.com",
    password: "password",
  });
  await authClient.signOut();
}
