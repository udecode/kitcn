import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('src/generated', { recursive: true });

for (let i = 0; i < 250; i += 1) {
  writeFileSync(
    `src/generated/use-auth-${i}.tsx`,
    `import { authClient } from "../auth-client.js";

export function UseAuth${i}() {
  const session = authClient.useSession();
  return session.data?.user?.email ?? null;
}

export async function mutateAuth${i}() {
  await authClient.signIn.email({
    email: "user${i}@example.com",
    password: "password",
  });
  await authClient.signOut();
}
`
  );
}
