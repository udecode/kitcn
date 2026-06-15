import { authClient } from "../auth-client.js";

export function UseAuth139() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth139() {
  await authClient.signIn.email({
    email: "user139@example.com",
    password: "password",
  });
  await authClient.signOut();
}
