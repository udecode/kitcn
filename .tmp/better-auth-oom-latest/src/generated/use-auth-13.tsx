import { authClient } from "../auth-client.js";

export function UseAuth13() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth13() {
  await authClient.signIn.email({
    email: "user13@example.com",
    password: "password",
  });
  await authClient.signOut();
}
