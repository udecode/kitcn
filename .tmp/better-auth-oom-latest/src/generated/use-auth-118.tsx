import { authClient } from "../auth-client.js";

export function UseAuth118() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth118() {
  await authClient.signIn.email({
    email: "user118@example.com",
    password: "password",
  });
  await authClient.signOut();
}
