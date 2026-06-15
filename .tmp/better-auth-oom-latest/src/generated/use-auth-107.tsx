import { authClient } from "../auth-client.js";

export function UseAuth107() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth107() {
  await authClient.signIn.email({
    email: "user107@example.com",
    password: "password",
  });
  await authClient.signOut();
}
