import { authClient } from "../auth-client.js";

export function UseAuth158() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth158() {
  await authClient.signIn.email({
    email: "user158@example.com",
    password: "password",
  });
  await authClient.signOut();
}
