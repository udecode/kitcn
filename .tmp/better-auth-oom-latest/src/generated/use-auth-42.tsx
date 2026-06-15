import { authClient } from "../auth-client.js";

export function UseAuth42() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth42() {
  await authClient.signIn.email({
    email: "user42@example.com",
    password: "password",
  });
  await authClient.signOut();
}
