import { authClient } from "../auth-client.js";

export function UseAuth18() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth18() {
  await authClient.signIn.email({
    email: "user18@example.com",
    password: "password",
  });
  await authClient.signOut();
}
