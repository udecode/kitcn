import { authClient } from "../auth-client.js";

export function UseAuth92() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth92() {
  await authClient.signIn.email({
    email: "user92@example.com",
    password: "password",
  });
  await authClient.signOut();
}
