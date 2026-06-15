import { authClient } from "../auth-client.js";

export function UseAuth110() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth110() {
  await authClient.signIn.email({
    email: "user110@example.com",
    password: "password",
  });
  await authClient.signOut();
}
