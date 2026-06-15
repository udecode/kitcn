import { authClient } from "../auth-client.js";

export function UseAuth212() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth212() {
  await authClient.signIn.email({
    email: "user212@example.com",
    password: "password",
  });
  await authClient.signOut();
}
