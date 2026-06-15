import { authClient } from "../auth-client.js";

export function UseAuth53() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth53() {
  await authClient.signIn.email({
    email: "user53@example.com",
    password: "password",
  });
  await authClient.signOut();
}
