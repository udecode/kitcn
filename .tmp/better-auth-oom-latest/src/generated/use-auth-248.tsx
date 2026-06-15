import { authClient } from "../auth-client.js";

export function UseAuth248() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth248() {
  await authClient.signIn.email({
    email: "user248@example.com",
    password: "password",
  });
  await authClient.signOut();
}
