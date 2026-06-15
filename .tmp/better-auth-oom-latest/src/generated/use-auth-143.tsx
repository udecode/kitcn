import { authClient } from "../auth-client.js";

export function UseAuth143() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth143() {
  await authClient.signIn.email({
    email: "user143@example.com",
    password: "password",
  });
  await authClient.signOut();
}
