import { authClient } from "../auth-client.js";

export function UseAuth5() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth5() {
  await authClient.signIn.email({
    email: "user5@example.com",
    password: "password",
  });
  await authClient.signOut();
}
