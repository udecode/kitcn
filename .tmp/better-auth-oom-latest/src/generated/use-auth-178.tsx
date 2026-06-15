import { authClient } from "../auth-client.js";

export function UseAuth178() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth178() {
  await authClient.signIn.email({
    email: "user178@example.com",
    password: "password",
  });
  await authClient.signOut();
}
