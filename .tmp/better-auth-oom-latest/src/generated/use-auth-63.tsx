import { authClient } from "../auth-client.js";

export function UseAuth63() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth63() {
  await authClient.signIn.email({
    email: "user63@example.com",
    password: "password",
  });
  await authClient.signOut();
}
