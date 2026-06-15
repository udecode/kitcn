import { authClient } from "../auth-client.js";

export function UseAuth109() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth109() {
  await authClient.signIn.email({
    email: "user109@example.com",
    password: "password",
  });
  await authClient.signOut();
}
