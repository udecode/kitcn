import { authClient } from "../auth-client.js";

export function UseAuth36() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth36() {
  await authClient.signIn.email({
    email: "user36@example.com",
    password: "password",
  });
  await authClient.signOut();
}
