import { authClient } from "../auth-client.js";

export function UseAuth210() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth210() {
  await authClient.signIn.email({
    email: "user210@example.com",
    password: "password",
  });
  await authClient.signOut();
}
