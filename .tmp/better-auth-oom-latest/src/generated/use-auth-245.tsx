import { authClient } from "../auth-client.js";

export function UseAuth245() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth245() {
  await authClient.signIn.email({
    email: "user245@example.com",
    password: "password",
  });
  await authClient.signOut();
}
