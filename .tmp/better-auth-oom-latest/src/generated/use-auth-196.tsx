import { authClient } from "../auth-client.js";

export function UseAuth196() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth196() {
  await authClient.signIn.email({
    email: "user196@example.com",
    password: "password",
  });
  await authClient.signOut();
}
