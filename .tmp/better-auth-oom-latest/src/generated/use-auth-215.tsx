import { authClient } from "../auth-client.js";

export function UseAuth215() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth215() {
  await authClient.signIn.email({
    email: "user215@example.com",
    password: "password",
  });
  await authClient.signOut();
}
