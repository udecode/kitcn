import { authClient } from "../auth-client.js";

export function UseAuth241() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth241() {
  await authClient.signIn.email({
    email: "user241@example.com",
    password: "password",
  });
  await authClient.signOut();
}
