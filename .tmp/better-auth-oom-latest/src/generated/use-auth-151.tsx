import { authClient } from "../auth-client.js";

export function UseAuth151() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth151() {
  await authClient.signIn.email({
    email: "user151@example.com",
    password: "password",
  });
  await authClient.signOut();
}
