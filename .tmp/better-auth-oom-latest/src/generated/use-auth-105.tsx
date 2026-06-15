import { authClient } from "../auth-client.js";

export function UseAuth105() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth105() {
  await authClient.signIn.email({
    email: "user105@example.com",
    password: "password",
  });
  await authClient.signOut();
}
