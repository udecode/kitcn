import { authClient } from "../auth-client.js";

export function UseAuth81() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth81() {
  await authClient.signIn.email({
    email: "user81@example.com",
    password: "password",
  });
  await authClient.signOut();
}
