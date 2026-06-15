import { authClient } from "../auth-client.js";

export function UseAuth83() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth83() {
  await authClient.signIn.email({
    email: "user83@example.com",
    password: "password",
  });
  await authClient.signOut();
}
