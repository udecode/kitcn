import { authClient } from "../auth-client.js";

export function UseAuth58() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth58() {
  await authClient.signIn.email({
    email: "user58@example.com",
    password: "password",
  });
  await authClient.signOut();
}
