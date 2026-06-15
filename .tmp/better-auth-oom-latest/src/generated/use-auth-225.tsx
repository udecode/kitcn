import { authClient } from "../auth-client.js";

export function UseAuth225() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth225() {
  await authClient.signIn.email({
    email: "user225@example.com",
    password: "password",
  });
  await authClient.signOut();
}
