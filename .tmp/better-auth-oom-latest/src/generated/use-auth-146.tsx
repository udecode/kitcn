import { authClient } from "../auth-client.js";

export function UseAuth146() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth146() {
  await authClient.signIn.email({
    email: "user146@example.com",
    password: "password",
  });
  await authClient.signOut();
}
