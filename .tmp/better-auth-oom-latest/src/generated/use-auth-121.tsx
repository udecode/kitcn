import { authClient } from "../auth-client.js";

export function UseAuth121() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth121() {
  await authClient.signIn.email({
    email: "user121@example.com",
    password: "password",
  });
  await authClient.signOut();
}
