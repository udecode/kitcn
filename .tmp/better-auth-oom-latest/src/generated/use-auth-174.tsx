import { authClient } from "../auth-client.js";

export function UseAuth174() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth174() {
  await authClient.signIn.email({
    email: "user174@example.com",
    password: "password",
  });
  await authClient.signOut();
}
