import { authClient } from "../auth-client.js";

export function UseAuth152() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth152() {
  await authClient.signIn.email({
    email: "user152@example.com",
    password: "password",
  });
  await authClient.signOut();
}
