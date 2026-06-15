import { authClient } from "../auth-client.js";

export function UseAuth6() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth6() {
  await authClient.signIn.email({
    email: "user6@example.com",
    password: "password",
  });
  await authClient.signOut();
}
