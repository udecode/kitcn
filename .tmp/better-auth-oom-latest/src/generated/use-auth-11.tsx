import { authClient } from "../auth-client.js";

export function UseAuth11() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth11() {
  await authClient.signIn.email({
    email: "user11@example.com",
    password: "password",
  });
  await authClient.signOut();
}
