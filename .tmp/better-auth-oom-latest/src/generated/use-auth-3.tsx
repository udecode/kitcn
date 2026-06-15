import { authClient } from "../auth-client.js";

export function UseAuth3() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth3() {
  await authClient.signIn.email({
    email: "user3@example.com",
    password: "password",
  });
  await authClient.signOut();
}
