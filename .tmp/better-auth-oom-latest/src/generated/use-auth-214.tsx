import { authClient } from "../auth-client.js";

export function UseAuth214() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth214() {
  await authClient.signIn.email({
    email: "user214@example.com",
    password: "password",
  });
  await authClient.signOut();
}
