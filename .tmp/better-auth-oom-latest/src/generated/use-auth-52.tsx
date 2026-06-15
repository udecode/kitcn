import { authClient } from "../auth-client.js";

export function UseAuth52() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth52() {
  await authClient.signIn.email({
    email: "user52@example.com",
    password: "password",
  });
  await authClient.signOut();
}
