import { authClient } from "../auth-client.js";

export function UseAuth137() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth137() {
  await authClient.signIn.email({
    email: "user137@example.com",
    password: "password",
  });
  await authClient.signOut();
}
