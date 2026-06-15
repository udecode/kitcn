import { authClient } from "../auth-client.js";

export function UseAuth135() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth135() {
  await authClient.signIn.email({
    email: "user135@example.com",
    password: "password",
  });
  await authClient.signOut();
}
