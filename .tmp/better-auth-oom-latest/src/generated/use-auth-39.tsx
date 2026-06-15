import { authClient } from "../auth-client.js";

export function UseAuth39() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth39() {
  await authClient.signIn.email({
    email: "user39@example.com",
    password: "password",
  });
  await authClient.signOut();
}
