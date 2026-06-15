import { authClient } from "../auth-client.js";

export function UseAuth217() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth217() {
  await authClient.signIn.email({
    email: "user217@example.com",
    password: "password",
  });
  await authClient.signOut();
}
