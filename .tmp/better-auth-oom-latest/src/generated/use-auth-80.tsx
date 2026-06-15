import { authClient } from "../auth-client.js";

export function UseAuth80() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth80() {
  await authClient.signIn.email({
    email: "user80@example.com",
    password: "password",
  });
  await authClient.signOut();
}
