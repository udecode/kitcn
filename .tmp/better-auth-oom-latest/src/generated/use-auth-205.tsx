import { authClient } from "../auth-client.js";

export function UseAuth205() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth205() {
  await authClient.signIn.email({
    email: "user205@example.com",
    password: "password",
  });
  await authClient.signOut();
}
