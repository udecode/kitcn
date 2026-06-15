import { authClient } from "../auth-client.js";

export function UseAuth235() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth235() {
  await authClient.signIn.email({
    email: "user235@example.com",
    password: "password",
  });
  await authClient.signOut();
}
