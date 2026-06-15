import { authClient } from "../auth-client.js";

export function UseAuth233() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth233() {
  await authClient.signIn.email({
    email: "user233@example.com",
    password: "password",
  });
  await authClient.signOut();
}
