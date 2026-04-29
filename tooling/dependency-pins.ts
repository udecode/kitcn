import fs from 'node:fs';
import path from 'node:path';
import {
  BETTER_AUTH_INSTALL_SPEC,
  getMinimumVersionRange as getSupportedMinimumVersionRange,
  SUPPORTED_DEPENDENCY_VERSIONS,
} from '../packages/kitcn/src/cli/supported-dependencies';

const PROJECT_ROOT = path.resolve(import.meta.dir, '..');
const SUPPORTED_DEPENDENCIES = ['convex', 'better-auth'] as const;
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+$/;
const SUPPORTED_CONVEX_VERSION_DECL_RE =
  /const SUPPORTED_CONVEX_VERSION = '\d+\.\d+\.\d+';/;
const SUPPORTED_BETTER_AUTH_VERSION_DECL_RE =
  /const SUPPORTED_BETTER_AUTH_VERSION = '\d+\.\d+\.\d+';/;

export const getMinimumVersionRange = getSupportedMinimumVersionRange;

type SupportedDependency = (typeof SUPPORTED_DEPENDENCIES)[number];

type PackageJsonLike = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
};

type PackageJsonUpdates = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type DependencyPinsArgs = {
  command: 'sync' | 'upgrade';
  dependency?: SupportedDependency;
  skipValidate: boolean;
  version?: string;
};

type PackageJsonTarget = {
  path: string;
  updates: PackageJsonUpdates;
};

const PACKAGE_JSON_TARGETS: PackageJsonTarget[] = [
  {
    path: 'package.json',
    updates: {
      dependencies: {
        '@tanstack/react-query':
          SUPPORTED_DEPENDENCY_VERSIONS.tanstackReactQuery.exact,
        convex: SUPPORTED_DEPENDENCY_VERSIONS.convex.exact,
        hono: SUPPORTED_DEPENDENCY_VERSIONS.hono.exact,
      },
      devDependencies: {
        'better-auth': SUPPORTED_DEPENDENCY_VERSIONS.betterAuth.exact,
      },
    },
  },
  {
    path: 'packages/kitcn/package.json',
    updates: {
      peerDependencies: {
        'better-auth': SUPPORTED_DEPENDENCY_VERSIONS.betterAuth.exact,
        convex: SUPPORTED_DEPENDENCY_VERSIONS.convex.minimum,
        hono: SUPPORTED_DEPENDENCY_VERSIONS.hono.exact,
      },
    },
  },
  {
    path: 'packages/resend/package.json',
    updates: {
      peerDependencies: {
        convex: SUPPORTED_DEPENDENCY_VERSIONS.convex.minimum,
      },
    },
  },
  {
    path: 'example/package.json',
    updates: {
      dependencies: {
        '@tanstack/react-query':
          SUPPORTED_DEPENDENCY_VERSIONS.tanstackReactQuery.exact,
        convex: SUPPORTED_DEPENDENCY_VERSIONS.convex.exact,
        hono: SUPPORTED_DEPENDENCY_VERSIONS.hono.exact,
      },
    },
  },
  {
    path: 'test/concave/fixture/package.json',
    updates: {
      dependencies: {
        convex: SUPPORTED_DEPENDENCY_VERSIONS.convex.exact,
      },
    },
  },
  {
    path: 'tooling/scenario-fixtures/create-convex-bare/package.json',
    updates: {
      dependencies: {
        convex: SUPPORTED_DEPENDENCY_VERSIONS.convex.range,
      },
    },
  },
  {
    path: 'tooling/scenario-fixtures/create-convex-nextjs-shadcn/package.json',
    updates: {
      dependencies: {
        convex: SUPPORTED_DEPENDENCY_VERSIONS.convex.range,
      },
    },
  },
  {
    path: 'tooling/scenario-fixtures/create-convex-react-vite-shadcn/package.json',
    updates: {
      dependencies: {
        convex: SUPPORTED_DEPENDENCY_VERSIONS.convex.range,
      },
    },
  },
];

const TEXT_TARGETS = [
  {
    path: 'packages/kitcn/skills/kitcn/references/setup/auth.md',
    replacements: [
      {
        pattern:
          /bun add better-auth@\d+\.\d+\.\d+ kitcn hono(@\d+\.\d+\.\d+)?/g,
        value: `bun add ${BETTER_AUTH_INSTALL_SPEC} kitcn hono@${SUPPORTED_DEPENDENCY_VERSIONS.hono.exact}`,
      },
    ],
  },
];

const readJson = <T>(filePath: string): T =>
  JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;

const writeJson = (filePath: string, value: unknown) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const run = async (cmd: string[], cwd = PROJECT_ROOT) => {
  const child = Bun.spawn({
    cmd,
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
};

export function parseDependencyPinsArgs(argv: string[]): DependencyPinsArgs {
  const [command, dependency, version] = argv;

  if (command === 'sync') {
    const skipValidate = dependency === '--skip-validate';
    if (
      (dependency && !skipValidate) ||
      version ||
      (skipValidate && argv.length !== 2)
    ) {
      throw new Error(
        'Usage: bun tooling/dependency-pins.ts sync [--skip-validate]'
      );
    }
    return {
      command,
      dependency: undefined,
      skipValidate,
      version: undefined,
    };
  }

  if (command === 'upgrade') {
    if (
      !dependency ||
      !SUPPORTED_DEPENDENCIES.includes(dependency as SupportedDependency) ||
      !version
    ) {
      throw new Error(
        'Usage: bun tooling/dependency-pins.ts upgrade <convex|better-auth> <x.y.z>'
      );
    }

    if (!EXACT_VERSION_RE.test(version)) {
      throw new Error(
        `Unsupported version "${version}". Expected exact x.y.z.`
      );
    }

    return {
      command,
      dependency: dependency as SupportedDependency,
      skipValidate: false,
      version,
    };
  }

  throw new Error(
    'Usage: bun tooling/dependency-pins.ts <sync|upgrade> [args]'
  );
}

export function applyPinnedVersionsToPackageJson<T extends PackageJsonLike>(
  packageJson: T,
  updates: PackageJsonUpdates
): T {
  const nextPackageJson: PackageJsonLike = {
    ...packageJson,
  };

  if (updates.dependencies) {
    nextPackageJson.dependencies = {
      ...(packageJson.dependencies ?? {}),
      ...updates.dependencies,
    };
  }

  if (updates.devDependencies) {
    nextPackageJson.devDependencies = {
      ...(packageJson.devDependencies ?? {}),
      ...updates.devDependencies,
    };
  }

  if (updates.peerDependencies) {
    nextPackageJson.peerDependencies = {
      ...(packageJson.peerDependencies ?? {}),
      ...updates.peerDependencies,
    };
  }

  return nextPackageJson as T;
}

function syncPackageJsonTargets() {
  for (const target of PACKAGE_JSON_TARGETS) {
    const filePath = path.join(PROJECT_ROOT, target.path);
    writeJson(
      filePath,
      applyPinnedVersionsToPackageJson(
        readJson<PackageJsonLike>(filePath),
        target.updates
      )
    );
  }
}

function syncTextTargets() {
  for (const target of TEXT_TARGETS) {
    const filePath = path.join(PROJECT_ROOT, target.path);
    let source = fs.readFileSync(filePath, 'utf8');

    for (const replacement of target.replacements) {
      source = source.replace(replacement.pattern, replacement.value);
    }

    fs.writeFileSync(filePath, source);
  }
}

async function validatePinnedDependencies() {
  await run(['bun', 'install']);
  await run(['bun', '--cwd', 'packages/kitcn', 'build']);
  await run(['bun', 'run', 'fixtures:sync']);
  await run(['bun', 'run', 'fixtures:check']);
  await run(['bun', 'run', 'scenario:check']);
  await run(['bun', 'run', 'scenario:check:convex']);
  await run(['bun', 'run', 'test:concave']);
  await run(['bun', 'typecheck']);
  await run(['bun', 'lint:fix']);
}

function updateSupportedDependencyVersion(
  dependency: SupportedDependency,
  version: string
) {
  const supportedDependenciesPath = path.join(
    PROJECT_ROOT,
    'packages/kitcn/src/cli/supported-dependencies.ts'
  );
  const source = fs.readFileSync(supportedDependenciesPath, 'utf8');
  const nextSource =
    dependency === 'convex'
      ? source.replace(
          SUPPORTED_CONVEX_VERSION_DECL_RE,
          `const SUPPORTED_CONVEX_VERSION = '${version}';`
        )
      : source.replace(
          SUPPORTED_BETTER_AUTH_VERSION_DECL_RE,
          `const SUPPORTED_BETTER_AUTH_VERSION = '${version}';`
        );

  fs.writeFileSync(supportedDependenciesPath, nextSource);
}

async function main() {
  const args = parseDependencyPinsArgs(process.argv.slice(2));

  if (args.command === 'upgrade') {
    updateSupportedDependencyVersion(args.dependency!, args.version!);
    await run(['bun', 'tooling/dependency-pins.ts', 'sync']);
    return;
  }

  syncPackageJsonTargets();
  syncTextTargets();
  if (!args.skipValidate) {
    await validatePinnedDependencies();
  }
}

if (import.meta.main) {
  await main();
}
