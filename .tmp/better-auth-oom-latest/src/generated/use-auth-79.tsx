import { authClient } from "../auth-client.js";

export function UseAuth79() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth79() {
  await authClient.signIn.email({
    email: "user79@example.com",
    password: "password",
  });
  await authClient.signOut();
}
