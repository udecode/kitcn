import { authClient } from "../auth-client.js";

export function UseAuth160() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth160() {
  await authClient.signIn.email({
    email: "user160@example.com",
    password: "password",
  });
  await authClient.signOut();
}
