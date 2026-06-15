import { authClient } from "../auth-client.js";

export function UseAuth184() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth184() {
  await authClient.signIn.email({
    email: "user184@example.com",
    password: "password",
  });
  await authClient.signOut();
}
