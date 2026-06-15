import { authClient } from "../auth-client.js";

export function UseAuth156() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth156() {
  await authClient.signIn.email({
    email: "user156@example.com",
    password: "password",
  });
  await authClient.signOut();
}
