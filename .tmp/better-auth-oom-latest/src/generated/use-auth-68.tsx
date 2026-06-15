import { authClient } from "../auth-client.js";

export function UseAuth68() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth68() {
  await authClient.signIn.email({
    email: "user68@example.com",
    password: "password",
  });
  await authClient.signOut();
}
