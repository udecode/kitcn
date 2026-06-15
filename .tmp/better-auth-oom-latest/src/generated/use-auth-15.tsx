import { authClient } from "../auth-client.js";

export function UseAuth15() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth15() {
  await authClient.signIn.email({
    email: "user15@example.com",
    password: "password",
  });
  await authClient.signOut();
}
