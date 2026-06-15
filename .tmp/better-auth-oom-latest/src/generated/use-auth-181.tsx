import { authClient } from "../auth-client.js";

export function UseAuth181() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth181() {
  await authClient.signIn.email({
    email: "user181@example.com",
    password: "password",
  });
  await authClient.signOut();
}
