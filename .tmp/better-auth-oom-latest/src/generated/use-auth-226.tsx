import { authClient } from "../auth-client.js";

export function UseAuth226() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth226() {
  await authClient.signIn.email({
    email: "user226@example.com",
    password: "password",
  });
  await authClient.signOut();
}
