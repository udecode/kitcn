import { authClient } from "../auth-client.js";

export function UseAuth108() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth108() {
  await authClient.signIn.email({
    email: "user108@example.com",
    password: "password",
  });
  await authClient.signOut();
}
