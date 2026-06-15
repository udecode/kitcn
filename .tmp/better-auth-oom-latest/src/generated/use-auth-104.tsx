import { authClient } from "../auth-client.js";

export function UseAuth104() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth104() {
  await authClient.signIn.email({
    email: "user104@example.com",
    password: "password",
  });
  await authClient.signOut();
}
