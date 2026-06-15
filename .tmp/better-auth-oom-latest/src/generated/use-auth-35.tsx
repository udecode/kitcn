import { authClient } from "../auth-client.js";

export function UseAuth35() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth35() {
  await authClient.signIn.email({
    email: "user35@example.com",
    password: "password",
  });
  await authClient.signOut();
}
