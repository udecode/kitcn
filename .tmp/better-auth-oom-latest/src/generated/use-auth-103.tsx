import { authClient } from "../auth-client.js";

export function UseAuth103() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth103() {
  await authClient.signIn.email({
    email: "user103@example.com",
    password: "password",
  });
  await authClient.signOut();
}
