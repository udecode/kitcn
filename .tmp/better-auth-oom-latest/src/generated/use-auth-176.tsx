import { authClient } from "../auth-client.js";

export function UseAuth176() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth176() {
  await authClient.signIn.email({
    email: "user176@example.com",
    password: "password",
  });
  await authClient.signOut();
}
