import { authClient } from "../auth-client.js";

export function UseAuth144() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth144() {
  await authClient.signIn.email({
    email: "user144@example.com",
    password: "password",
  });
  await authClient.signOut();
}
