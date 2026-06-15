import { authClient } from "../auth-client.js";

export function UseAuth207() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth207() {
  await authClient.signIn.email({
    email: "user207@example.com",
    password: "password",
  });
  await authClient.signOut();
}
