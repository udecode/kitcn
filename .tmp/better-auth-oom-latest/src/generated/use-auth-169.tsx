import { authClient } from "../auth-client.js";

export function UseAuth169() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth169() {
  await authClient.signIn.email({
    email: "user169@example.com",
    password: "password",
  });
  await authClient.signOut();
}
