import { authClient } from "../auth-client.js";

export function UseAuth69() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth69() {
  await authClient.signIn.email({
    email: "user69@example.com",
    password: "password",
  });
  await authClient.signOut();
}
