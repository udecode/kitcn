import { authClient } from "../auth-client.js";

export function UseAuth179() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth179() {
  await authClient.signIn.email({
    email: "user179@example.com",
    password: "password",
  });
  await authClient.signOut();
}
