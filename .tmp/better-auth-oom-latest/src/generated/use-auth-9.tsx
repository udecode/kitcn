import { authClient } from "../auth-client.js";

export function UseAuth9() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth9() {
  await authClient.signIn.email({
    email: "user9@example.com",
    password: "password",
  });
  await authClient.signOut();
}
