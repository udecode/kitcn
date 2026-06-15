import { authClient } from "../auth-client.js";

export function UseAuth37() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth37() {
  await authClient.signIn.email({
    email: "user37@example.com",
    password: "password",
  });
  await authClient.signOut();
}
