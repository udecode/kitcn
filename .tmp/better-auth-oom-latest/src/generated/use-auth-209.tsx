import { authClient } from "../auth-client.js";

export function UseAuth209() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth209() {
  await authClient.signIn.email({
    email: "user209@example.com",
    password: "password",
  });
  await authClient.signOut();
}
