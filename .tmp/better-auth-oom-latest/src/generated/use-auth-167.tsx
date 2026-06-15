import { authClient } from "../auth-client.js";

export function UseAuth167() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth167() {
  await authClient.signIn.email({
    email: "user167@example.com",
    password: "password",
  });
  await authClient.signOut();
}
