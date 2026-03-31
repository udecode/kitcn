export const packageManagers = ['npm', 'pnpm', 'yarn', 'bun'] as const;

export type PackageManager = (typeof packageManagers)[number];

const latestKitcnRunners: Record<PackageManager, string> = {
  npm: 'npx kitcn@latest',
  pnpm: 'pnpm dlx kitcn@latest',
  yarn: 'yarn dlx kitcn@latest',
  bun: 'bunx --bun kitcn@latest',
};

export function getLatestKitcnCommands(commands: string | string[]) {
  const values = Array.isArray(commands) ? commands : [commands];

  return Object.fromEntries(
    packageManagers.map((packageManager) => [
      packageManager,
      values
        .map((command) =>
          `${latestKitcnRunners[packageManager]} ${command}`.trim()
        )
        .join('\n'),
    ])
  ) as Record<PackageManager, string>;
}
