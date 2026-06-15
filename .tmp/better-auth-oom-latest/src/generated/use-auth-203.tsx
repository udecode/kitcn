import { authClient } from "../auth-client.js";

export function UseAuth203() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth203() {
  await authClient.signIn.email({
    email: "user203@example.com",
    password: "password",
  });
  await authClient.signOut();
}
