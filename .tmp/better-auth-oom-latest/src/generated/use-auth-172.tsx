import { authClient } from "../auth-client.js";

export function UseAuth172() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth172() {
  await authClient.signIn.email({
    email: "user172@example.com",
    password: "password",
  });
  await authClient.signOut();
}
