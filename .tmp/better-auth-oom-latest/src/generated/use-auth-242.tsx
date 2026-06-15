import { authClient } from "../auth-client.js";

export function UseAuth242() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth242() {
  await authClient.signIn.email({
    email: "user242@example.com",
    password: "password",
  });
  await authClient.signOut();
}
