import { authClient } from "../auth-client.js";

export function UseAuth228() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth228() {
  await authClient.signIn.email({
    email: "user228@example.com",
    password: "password",
  });
  await authClient.signOut();
}
