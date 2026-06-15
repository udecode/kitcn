import { authClient } from "../auth-client.js";

export function UseAuth191() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth191() {
  await authClient.signIn.email({
    email: "user191@example.com",
    password: "password",
  });
  await authClient.signOut();
}
