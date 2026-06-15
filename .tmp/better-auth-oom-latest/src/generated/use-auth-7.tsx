import { authClient } from "../auth-client.js";

export function UseAuth7() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth7() {
  await authClient.signIn.email({
    email: "user7@example.com",
    password: "password",
  });
  await authClient.signOut();
}
