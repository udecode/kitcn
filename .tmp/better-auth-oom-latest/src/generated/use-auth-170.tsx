import { authClient } from "../auth-client.js";

export function UseAuth170() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth170() {
  await authClient.signIn.email({
    email: "user170@example.com",
    password: "password",
  });
  await authClient.signOut();
}
