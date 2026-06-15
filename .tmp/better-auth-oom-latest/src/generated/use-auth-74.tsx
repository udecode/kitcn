import { authClient } from "../auth-client.js";

export function UseAuth74() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth74() {
  await authClient.signIn.email({
    email: "user74@example.com",
    password: "password",
  });
  await authClient.signOut();
}
