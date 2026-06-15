import { authClient } from "../auth-client.js";

export function UseAuth206() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth206() {
  await authClient.signIn.email({
    email: "user206@example.com",
    password: "password",
  });
  await authClient.signOut();
}
