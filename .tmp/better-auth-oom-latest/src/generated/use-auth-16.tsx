import { authClient } from "../auth-client.js";

export function UseAuth16() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth16() {
  await authClient.signIn.email({
    email: "user16@example.com",
    password: "password",
  });
  await authClient.signOut();
}
