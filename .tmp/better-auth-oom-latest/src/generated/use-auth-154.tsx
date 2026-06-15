import { authClient } from "../auth-client.js";

export function UseAuth154() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth154() {
  await authClient.signIn.email({
    email: "user154@example.com",
    password: "password",
  });
  await authClient.signOut();
}
