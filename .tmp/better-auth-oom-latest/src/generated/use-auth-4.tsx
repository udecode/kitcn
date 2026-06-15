import { authClient } from "../auth-client.js";

export function UseAuth4() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth4() {
  await authClient.signIn.email({
    email: "user4@example.com",
    password: "password",
  });
  await authClient.signOut();
}
