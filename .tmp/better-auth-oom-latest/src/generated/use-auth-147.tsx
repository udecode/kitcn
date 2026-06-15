import { authClient } from "../auth-client.js";

export function UseAuth147() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth147() {
  await authClient.signIn.email({
    email: "user147@example.com",
    password: "password",
  });
  await authClient.signOut();
}
