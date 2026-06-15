import { authClient } from "../auth-client.js";

export function UseAuth153() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth153() {
  await authClient.signIn.email({
    email: "user153@example.com",
    password: "password",
  });
  await authClient.signOut();
}
