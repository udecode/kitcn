import { authClient } from "../auth-client.js";

export function UseAuth175() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth175() {
  await authClient.signIn.email({
    email: "user175@example.com",
    password: "password",
  });
  await authClient.signOut();
}
