import { authClient } from "../auth-client.js";

export function UseAuth84() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth84() {
  await authClient.signIn.email({
    email: "user84@example.com",
    password: "password",
  });
  await authClient.signOut();
}
