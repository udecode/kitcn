import { authClient } from "../auth-client.js";

export function UseAuth26() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth26() {
  await authClient.signIn.email({
    email: "user26@example.com",
    password: "password",
  });
  await authClient.signOut();
}
