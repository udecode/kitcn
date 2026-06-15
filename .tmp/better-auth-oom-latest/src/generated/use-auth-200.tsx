import { authClient } from "../auth-client.js";

export function UseAuth200() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth200() {
  await authClient.signIn.email({
    email: "user200@example.com",
    password: "password",
  });
  await authClient.signOut();
}
