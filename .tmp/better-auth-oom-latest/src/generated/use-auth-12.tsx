import { authClient } from "../auth-client.js";

export function UseAuth12() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth12() {
  await authClient.signIn.email({
    email: "user12@example.com",
    password: "password",
  });
  await authClient.signOut();
}
