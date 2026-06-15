import { authClient } from "../auth-client.js";

export function UseAuth73() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth73() {
  await authClient.signIn.email({
    email: "user73@example.com",
    password: "password",
  });
  await authClient.signOut();
}
