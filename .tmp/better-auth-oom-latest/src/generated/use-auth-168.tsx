import { authClient } from "../auth-client.js";

export function UseAuth168() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth168() {
  await authClient.signIn.email({
    email: "user168@example.com",
    password: "password",
  });
  await authClient.signOut();
}
