import { authClient } from "../auth-client.js";

export function UseAuth101() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth101() {
  await authClient.signIn.email({
    email: "user101@example.com",
    password: "password",
  });
  await authClient.signOut();
}
