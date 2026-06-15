import { authClient } from "../auth-client.js";

export function UseAuth72() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth72() {
  await authClient.signIn.email({
    email: "user72@example.com",
    password: "password",
  });
  await authClient.signOut();
}
