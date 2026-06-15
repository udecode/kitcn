import { authClient } from "../auth-client.js";

export function UseAuth122() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth122() {
  await authClient.signIn.email({
    email: "user122@example.com",
    password: "password",
  });
  await authClient.signOut();
}
