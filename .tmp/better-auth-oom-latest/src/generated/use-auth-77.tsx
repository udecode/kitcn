import { authClient } from "../auth-client.js";

export function UseAuth77() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth77() {
  await authClient.signIn.email({
    email: "user77@example.com",
    password: "password",
  });
  await authClient.signOut();
}
