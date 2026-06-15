import { authClient } from "../auth-client.js";

export function UseAuth180() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth180() {
  await authClient.signIn.email({
    email: "user180@example.com",
    password: "password",
  });
  await authClient.signOut();
}
