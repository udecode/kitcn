import { authClient } from "../auth-client.js";

export function UseAuth90() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth90() {
  await authClient.signIn.email({
    email: "user90@example.com",
    password: "password",
  });
  await authClient.signOut();
}
