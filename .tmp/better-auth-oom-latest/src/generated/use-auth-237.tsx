import { authClient } from "../auth-client.js";

export function UseAuth237() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth237() {
  await authClient.signIn.email({
    email: "user237@example.com",
    password: "password",
  });
  await authClient.signOut();
}
