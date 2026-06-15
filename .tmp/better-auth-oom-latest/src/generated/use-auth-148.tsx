import { authClient } from "../auth-client.js";

export function UseAuth148() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth148() {
  await authClient.signIn.email({
    email: "user148@example.com",
    password: "password",
  });
  await authClient.signOut();
}
