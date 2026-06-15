import { authClient } from "../auth-client.js";

export function UseAuth94() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth94() {
  await authClient.signIn.email({
    email: "user94@example.com",
    password: "password",
  });
  await authClient.signOut();
}
