import { authClient } from "../auth-client.js";

export function UseAuth133() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth133() {
  await authClient.signIn.email({
    email: "user133@example.com",
    password: "password",
  });
  await authClient.signOut();
}
