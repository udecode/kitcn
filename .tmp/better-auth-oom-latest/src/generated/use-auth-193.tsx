import { authClient } from "../auth-client.js";

export function UseAuth193() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth193() {
  await authClient.signIn.email({
    email: "user193@example.com",
    password: "password",
  });
  await authClient.signOut();
}
