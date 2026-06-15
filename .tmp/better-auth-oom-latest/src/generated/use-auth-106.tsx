import { authClient } from "../auth-client.js";

export function UseAuth106() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth106() {
  await authClient.signIn.email({
    email: "user106@example.com",
    password: "password",
  });
  await authClient.signOut();
}
