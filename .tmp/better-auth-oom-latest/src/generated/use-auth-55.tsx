import { authClient } from "../auth-client.js";

export function UseAuth55() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth55() {
  await authClient.signIn.email({
    email: "user55@example.com",
    password: "password",
  });
  await authClient.signOut();
}
