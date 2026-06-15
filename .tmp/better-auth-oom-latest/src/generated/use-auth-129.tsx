import { authClient } from "../auth-client.js";

export function UseAuth129() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth129() {
  await authClient.signIn.email({
    email: "user129@example.com",
    password: "password",
  });
  await authClient.signOut();
}
