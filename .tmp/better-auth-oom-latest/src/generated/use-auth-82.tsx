import { authClient } from "../auth-client.js";

export function UseAuth82() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth82() {
  await authClient.signIn.email({
    email: "user82@example.com",
    password: "password",
  });
  await authClient.signOut();
}
