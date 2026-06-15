import { authClient } from "../auth-client.js";

export function UseAuth102() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth102() {
  await authClient.signIn.email({
    email: "user102@example.com",
    password: "password",
  });
  await authClient.signOut();
}
