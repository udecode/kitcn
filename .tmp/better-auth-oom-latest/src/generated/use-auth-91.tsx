import { authClient } from "../auth-client.js";

export function UseAuth91() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth91() {
  await authClient.signIn.email({
    email: "user91@example.com",
    password: "password",
  });
  await authClient.signOut();
}
