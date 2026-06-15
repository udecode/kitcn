import { authClient } from "../auth-client.js";

export function UseAuth60() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth60() {
  await authClient.signIn.email({
    email: "user60@example.com",
    password: "password",
  });
  await authClient.signOut();
}
