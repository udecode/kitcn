import { authClient } from "../auth-client.js";

export function UseAuth243() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth243() {
  await authClient.signIn.email({
    email: "user243@example.com",
    password: "password",
  });
  await authClient.signOut();
}
