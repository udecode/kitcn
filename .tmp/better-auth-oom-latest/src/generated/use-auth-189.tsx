import { authClient } from "../auth-client.js";

export function UseAuth189() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth189() {
  await authClient.signIn.email({
    email: "user189@example.com",
    password: "password",
  });
  await authClient.signOut();
}
