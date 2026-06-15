import { authClient } from "../auth-client.js";

export function UseAuth244() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth244() {
  await authClient.signIn.email({
    email: "user244@example.com",
    password: "password",
  });
  await authClient.signOut();
}
