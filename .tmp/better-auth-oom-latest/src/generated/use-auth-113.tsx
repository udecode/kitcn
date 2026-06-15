import { authClient } from "../auth-client.js";

export function UseAuth113() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth113() {
  await authClient.signIn.email({
    email: "user113@example.com",
    password: "password",
  });
  await authClient.signOut();
}
