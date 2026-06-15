import { authClient } from "../auth-client.js";

export function UseAuth10() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth10() {
  await authClient.signIn.email({
    email: "user10@example.com",
    password: "password",
  });
  await authClient.signOut();
}
