import { authClient } from "../auth-client.js";

export function UseAuth17() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth17() {
  await authClient.signIn.email({
    email: "user17@example.com",
    password: "password",
  });
  await authClient.signOut();
}
