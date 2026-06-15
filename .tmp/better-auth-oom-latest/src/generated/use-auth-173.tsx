import { authClient } from "../auth-client.js";

export function UseAuth173() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth173() {
  await authClient.signIn.email({
    email: "user173@example.com",
    password: "password",
  });
  await authClient.signOut();
}
