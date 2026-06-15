import { authClient } from "../auth-client.js";

export function UseAuth127() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth127() {
  await authClient.signIn.email({
    email: "user127@example.com",
    password: "password",
  });
  await authClient.signOut();
}
