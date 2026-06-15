import { authClient } from "../auth-client.js";

export function UseAuth187() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth187() {
  await authClient.signIn.email({
    email: "user187@example.com",
    password: "password",
  });
  await authClient.signOut();
}
