import { authClient } from "../auth-client.js";

export function UseAuth236() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth236() {
  await authClient.signIn.email({
    email: "user236@example.com",
    password: "password",
  });
  await authClient.signOut();
}
