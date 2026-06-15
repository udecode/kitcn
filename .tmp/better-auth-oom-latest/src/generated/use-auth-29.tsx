import { authClient } from "../auth-client.js";

export function UseAuth29() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth29() {
  await authClient.signIn.email({
    email: "user29@example.com",
    password: "password",
  });
  await authClient.signOut();
}
