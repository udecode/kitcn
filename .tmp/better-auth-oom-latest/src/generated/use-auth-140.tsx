import { authClient } from "../auth-client.js";

export function UseAuth140() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth140() {
  await authClient.signIn.email({
    email: "user140@example.com",
    password: "password",
  });
  await authClient.signOut();
}
