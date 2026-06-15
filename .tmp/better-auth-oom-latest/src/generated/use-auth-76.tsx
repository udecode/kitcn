import { authClient } from "../auth-client.js";

export function UseAuth76() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth76() {
  await authClient.signIn.email({
    email: "user76@example.com",
    password: "password",
  });
  await authClient.signOut();
}
