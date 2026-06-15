import { authClient } from "../auth-client.js";

export function UseAuth183() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth183() {
  await authClient.signIn.email({
    email: "user183@example.com",
    password: "password",
  });
  await authClient.signOut();
}
