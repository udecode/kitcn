import { authClient } from "../auth-client.js";

export function UseAuth234() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth234() {
  await authClient.signIn.email({
    email: "user234@example.com",
    password: "password",
  });
  await authClient.signOut();
}
