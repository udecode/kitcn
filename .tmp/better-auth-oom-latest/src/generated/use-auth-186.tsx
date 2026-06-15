import { authClient } from "../auth-client.js";

export function UseAuth186() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth186() {
  await authClient.signIn.email({
    email: "user186@example.com",
    password: "password",
  });
  await authClient.signOut();
}
