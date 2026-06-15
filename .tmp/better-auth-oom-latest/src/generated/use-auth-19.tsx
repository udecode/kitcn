import { authClient } from "../auth-client.js";

export function UseAuth19() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth19() {
  await authClient.signIn.email({
    email: "user19@example.com",
    password: "password",
  });
  await authClient.signOut();
}
