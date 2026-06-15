import { authClient } from "../auth-client.js";

export function UseAuth162() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth162() {
  await authClient.signIn.email({
    email: "user162@example.com",
    password: "password",
  });
  await authClient.signOut();
}
