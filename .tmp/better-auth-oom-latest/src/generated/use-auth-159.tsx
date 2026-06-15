import { authClient } from "../auth-client.js";

export function UseAuth159() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth159() {
  await authClient.signIn.email({
    email: "user159@example.com",
    password: "password",
  });
  await authClient.signOut();
}
