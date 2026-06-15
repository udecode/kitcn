import { authClient } from "../auth-client.js";

export function UseAuth239() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth239() {
  await authClient.signIn.email({
    email: "user239@example.com",
    password: "password",
  });
  await authClient.signOut();
}
