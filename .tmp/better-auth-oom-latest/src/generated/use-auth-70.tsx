import { authClient } from "../auth-client.js";

export function UseAuth70() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth70() {
  await authClient.signIn.email({
    email: "user70@example.com",
    password: "password",
  });
  await authClient.signOut();
}
