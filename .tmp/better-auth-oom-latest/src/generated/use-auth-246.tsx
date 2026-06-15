import { authClient } from "../auth-client.js";

export function UseAuth246() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth246() {
  await authClient.signIn.email({
    email: "user246@example.com",
    password: "password",
  });
  await authClient.signOut();
}
