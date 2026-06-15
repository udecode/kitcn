import { authClient } from "../auth-client.js";

export function UseAuth238() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth238() {
  await authClient.signIn.email({
    email: "user238@example.com",
    password: "password",
  });
  await authClient.signOut();
}
