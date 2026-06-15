import { authClient } from "../auth-client.js";

export function UseAuth123() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth123() {
  await authClient.signIn.email({
    email: "user123@example.com",
    password: "password",
  });
  await authClient.signOut();
}
