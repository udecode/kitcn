import { authClient } from "../auth-client.js";

export function UseAuth49() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth49() {
  await authClient.signIn.email({
    email: "user49@example.com",
    password: "password",
  });
  await authClient.signOut();
}
