import { authClient } from "../auth-client.js";

export function UseAuth43() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth43() {
  await authClient.signIn.email({
    email: "user43@example.com",
    password: "password",
  });
  await authClient.signOut();
}
