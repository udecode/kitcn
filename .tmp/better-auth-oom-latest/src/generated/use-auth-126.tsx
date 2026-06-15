import { authClient } from "../auth-client.js";

export function UseAuth126() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth126() {
  await authClient.signIn.email({
    email: "user126@example.com",
    password: "password",
  });
  await authClient.signOut();
}
