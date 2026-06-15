import { authClient } from "../auth-client.js";

export function UseAuth182() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth182() {
  await authClient.signIn.email({
    email: "user182@example.com",
    password: "password",
  });
  await authClient.signOut();
}
