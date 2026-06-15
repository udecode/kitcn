import { authClient } from "../auth-client.js";

export function UseAuth111() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth111() {
  await authClient.signIn.email({
    email: "user111@example.com",
    password: "password",
  });
  await authClient.signOut();
}
