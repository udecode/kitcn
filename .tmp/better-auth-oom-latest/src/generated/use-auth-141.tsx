import { authClient } from "../auth-client.js";

export function UseAuth141() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth141() {
  await authClient.signIn.email({
    email: "user141@example.com",
    password: "password",
  });
  await authClient.signOut();
}
