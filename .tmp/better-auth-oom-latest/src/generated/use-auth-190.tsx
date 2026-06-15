import { authClient } from "../auth-client.js";

export function UseAuth190() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth190() {
  await authClient.signIn.email({
    email: "user190@example.com",
    password: "password",
  });
  await authClient.signOut();
}
