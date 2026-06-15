import { authClient } from "../auth-client.js";

export function UseAuth46() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth46() {
  await authClient.signIn.email({
    email: "user46@example.com",
    password: "password",
  });
  await authClient.signOut();
}
