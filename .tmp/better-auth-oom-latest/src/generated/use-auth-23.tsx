import { authClient } from "../auth-client.js";

export function UseAuth23() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth23() {
  await authClient.signIn.email({
    email: "user23@example.com",
    password: "password",
  });
  await authClient.signOut();
}
