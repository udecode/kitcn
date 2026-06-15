import { authClient } from "../auth-client.js";

export function UseAuth51() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth51() {
  await authClient.signIn.email({
    email: "user51@example.com",
    password: "password",
  });
  await authClient.signOut();
}
