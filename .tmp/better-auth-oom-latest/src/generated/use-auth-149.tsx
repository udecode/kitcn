import { authClient } from "../auth-client.js";

export function UseAuth149() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth149() {
  await authClient.signIn.email({
    email: "user149@example.com",
    password: "password",
  });
  await authClient.signOut();
}
