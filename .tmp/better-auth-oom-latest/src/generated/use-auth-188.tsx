import { authClient } from "../auth-client.js";

export function UseAuth188() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth188() {
  await authClient.signIn.email({
    email: "user188@example.com",
    password: "password",
  });
  await authClient.signOut();
}
