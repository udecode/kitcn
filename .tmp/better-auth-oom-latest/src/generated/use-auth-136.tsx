import { authClient } from "../auth-client.js";

export function UseAuth136() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth136() {
  await authClient.signIn.email({
    email: "user136@example.com",
    password: "password",
  });
  await authClient.signOut();
}
