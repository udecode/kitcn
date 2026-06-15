import { authClient } from "../auth-client.js";

export function UseAuth40() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth40() {
  await authClient.signIn.email({
    email: "user40@example.com",
    password: "password",
  });
  await authClient.signOut();
}
