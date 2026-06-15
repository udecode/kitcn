import { authClient } from "../auth-client.js";

export function UseAuth86() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth86() {
  await authClient.signIn.email({
    email: "user86@example.com",
    password: "password",
  });
  await authClient.signOut();
}
