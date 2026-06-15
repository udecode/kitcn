import { authClient } from "../auth-client.js";

export function UseAuth115() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth115() {
  await authClient.signIn.email({
    email: "user115@example.com",
    password: "password",
  });
  await authClient.signOut();
}
