import { authClient } from "../auth-client.js";

export function UseAuth150() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth150() {
  await authClient.signIn.email({
    email: "user150@example.com",
    password: "password",
  });
  await authClient.signOut();
}
