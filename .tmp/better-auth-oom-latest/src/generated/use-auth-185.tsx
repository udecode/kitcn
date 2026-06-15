import { authClient } from "../auth-client.js";

export function UseAuth185() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth185() {
  await authClient.signIn.email({
    email: "user185@example.com",
    password: "password",
  });
  await authClient.signOut();
}
