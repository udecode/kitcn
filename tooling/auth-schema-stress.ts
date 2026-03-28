import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAuthOptionsFromDefinition } from '../packages/better-convex/src/cli/registry/items/auth/reconcile-auth-schema';

type ExtraPlugin = 'jwt' | 'phoneNumber' | 'twoFactor';

type StressCase = {
  extras: ExtraPlugin[];
  name: string;
};

type SnapshotState = {
  backupDir: string;
  relativePaths: string[];
};

type RunCommand = (
  cmd: string[],
  cwd: string,
  options?: {
    env?: Record<string, string | undefined>;
  }
) => Promise<number>;

type RunAuthSchemaStressParams = {
  logFn?: (message: string) => void;
  projectDir: string;
  runCommand?: RunCommand;
};

const EXTRA_PLUGIN_IMPORTS: Record<ExtraPlugin, string> = {
  jwt: 'jwt',
  phoneNumber: 'phoneNumber',
  twoFactor: 'twoFactor',
};

const EXTRA_PLUGIN_IDS: Record<ExtraPlugin, string> = {
  jwt: 'jwt',
  phoneNumber: 'phone-number',
  twoFactor: 'two-factor',
};

const BETTER_AUTH_PLUGIN_IMPORT_RE =
  /import\s*\{([^}]+)\}\s*from ['"]better-auth\/plugins['"];/;
const CONVEX_PLUGIN_LINE_RE = /^(\s*)convex\(\{/m;

const IMPORT_ORDER = [
  'admin',
  'anonymous',
  'jwt',
  'organization',
  'phoneNumber',
  'twoFactor',
  'username',
] as const;

const CASES: StressCase[] = [
  {
    extras: [],
    name: 'baseline',
  },
  {
    extras: ['twoFactor'],
    name: 'two-factor',
  },
  {
    extras: ['phoneNumber'],
    name: 'phone-number',
  },
  {
    extras: ['jwt'],
    name: 'jwt',
  },
  {
    extras: ['twoFactor', 'phoneNumber'],
    name: 'two-factor+phone-number',
  },
  {
    extras: ['twoFactor', 'jwt'],
    name: 'two-factor+jwt',
  },
  {
    extras: ['phoneNumber', 'jwt'],
    name: 'phone-number+jwt',
  },
  {
    extras: ['twoFactor', 'phoneNumber', 'jwt'],
    name: 'two-factor+phone-number+jwt',
  },
] as const;

const PLUGIN_SCHEMA_SNIPPETS: Record<string, readonly string[]> = {
  'phone-number': [
    'phoneNumber: text().unique(),',
    'phoneNumberVerified: boolean(),',
  ],
  organization: ['organization: organizationTable,'],
  'two-factor': [
    'twoFactorEnabled: boolean(),',
    'export const twoFactorTable = convexTable(',
    'twoFactors: r.many.twoFactor({',
  ],
  username: ['displayUsername: text(),'],
};

const log = (message: string) => {
  process.stdout.write(`${message}\n`);
};

const readJson = <T>(filePath: string) =>
  JSON.parse(readFileSync(filePath, 'utf8')) as T;

const defaultRunCommand: RunCommand = async (cmd, cwd, options) => {
  const result = spawnSync(cmd[0]!, cmd.slice(1), {
    cwd,
    env: {
      ...process.env,
      ...options?.env,
    },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status ?? 'unknown'}): ${cmd.join(' ')}`
    );
  }

  return result.status ?? 0;
};

const resolveFunctionsDir = (projectDir: string) => {
  const convexConfigPath = path.join(projectDir, 'convex.json');
  if (!existsSync(convexConfigPath)) {
    return path.join(projectDir, 'convex');
  }

  const convexConfig = readJson<{ functions?: string }>(convexConfigPath);
  return path.join(projectDir, convexConfig.functions ?? 'convex');
};

const resolveSharedDir = (projectDir: string) => {
  const concaveConfigPath = path.join(projectDir, 'concave.json');
  if (!existsSync(concaveConfigPath)) {
    return path.join(projectDir, 'convex', 'shared');
  }

  const concaveConfig = readJson<{
    meta?: {
      'better-convex'?: {
        paths?: {
          shared?: string;
        };
      };
    };
  }>(concaveConfigPath);

  return path.join(
    projectDir,
    concaveConfig.meta?.['better-convex']?.paths?.shared ?? 'convex/shared'
  );
};

const orderImportName = (left: string, right: string) =>
  IMPORT_ORDER.indexOf(left as (typeof IMPORT_ORDER)[number]) -
  IMPORT_ORDER.indexOf(right as (typeof IMPORT_ORDER)[number]);

export const patchAuthSource = (
  source: string,
  extras: readonly ExtraPlugin[]
) => {
  const convexPluginLineMatch = source.match(CONVEX_PLUGIN_LINE_RE);
  if (!convexPluginLineMatch) {
    throw new Error('Could not find the Convex plugin marker in auth.ts.');
  }

  const [, pluginIndent = ''] = convexPluginLineMatch;
  const importMatch = source.match(BETTER_AUTH_PLUGIN_IMPORT_RE);
  const mergedImports = [
    ...new Set([
      ...(importMatch?.[1]
        ?.split(',')
        .map((name) => name.trim())
        .filter(Boolean) ?? []),
      ...extras.map((extra) => EXTRA_PLUGIN_IMPORTS[extra]),
    ]),
  ].sort(orderImportName);

  const injectedPlugins = extras
    .map((extra) => `${pluginIndent}${EXTRA_PLUGIN_IMPORTS[extra]}(),`)
    .join('\n');

  let patchedSource = source;

  if (importMatch) {
    const importLine = `import { ${mergedImports.join(', ')} } from 'better-auth/plugins';`;
    patchedSource = patchedSource.replace(importMatch[0], importLine);
  } else if (mergedImports.length > 0) {
    if (!patchedSource.startsWith('import ')) {
      throw new Error('Could not find an import boundary in auth.ts.');
    }

    const importLine = `import { ${mergedImports.join(', ')} } from 'better-auth/plugins';\n`;
    patchedSource = `${importLine}${patchedSource}`;
  }

  return patchedSource.replace(
    CONVEX_PLUGIN_LINE_RE,
    injectedPlugins ? `${injectedPlugins}\n$1convex({` : '$1convex({'
  );
};

const getPluginIds = (
  authOptions: Awaited<ReturnType<typeof loadAuthOptionsFromDefinition>>
) =>
  (authOptions?.plugins ?? []).map((plugin) => {
    const candidate = plugin as { id?: string; name?: string };
    return candidate.id ?? candidate.name ?? typeof plugin;
  });

const resolveExpectedSchemaSnippets = (pluginIds: Iterable<string>) => [
  ...new Set(
    [...pluginIds].flatMap((pluginId) => PLUGIN_SCHEMA_SNIPPETS[pluginId] ?? [])
  ),
];

const createSnapshot = (
  projectDir: string,
  functionsDir: string,
  sharedDir: string
): SnapshotState => {
  const backupDir = mkdtempSync(
    path.join(os.tmpdir(), 'better-convex-auth-schema-stress-')
  );
  const relativePaths = [
    path.relative(projectDir, path.join(functionsDir, 'auth.ts')),
    path.relative(projectDir, path.join(functionsDir, 'plugins.lock.json')),
    path.relative(projectDir, path.join(functionsDir, 'schema.ts')),
    path.relative(projectDir, path.join(functionsDir, '_generated')),
    path.relative(projectDir, path.join(functionsDir, 'generated')),
    path.relative(projectDir, path.join(sharedDir, 'api.ts')),
  ].filter((relativePath) => existsSync(path.join(projectDir, relativePath)));

  for (const relativePath of relativePaths) {
    const sourcePath = path.join(projectDir, relativePath);
    const backupPath = path.join(backupDir, relativePath);
    mkdirSync(path.dirname(backupPath), { recursive: true });
    cpSync(sourcePath, backupPath, { recursive: true });
  }

  return {
    backupDir,
    relativePaths,
  };
};

const restoreSnapshot = (
  projectDir: string,
  snapshot: SnapshotState,
  functionsDir: string,
  sharedDir: string,
  params: {
    cleanupBackup?: boolean;
  } = {}
) => {
  const candidatePaths = [
    path.relative(projectDir, path.join(functionsDir, 'auth.ts')),
    path.relative(projectDir, path.join(functionsDir, 'plugins.lock.json')),
    path.relative(projectDir, path.join(functionsDir, 'schema.ts')),
    path.relative(projectDir, path.join(functionsDir, '_generated')),
    path.relative(projectDir, path.join(functionsDir, 'generated')),
    path.relative(projectDir, path.join(sharedDir, 'api.ts')),
  ];

  for (const relativePath of candidatePaths) {
    rmSync(path.join(projectDir, relativePath), {
      force: true,
      recursive: true,
    });
  }

  for (const relativePath of snapshot.relativePaths) {
    const sourcePath = path.join(snapshot.backupDir, relativePath);
    const targetPath = path.join(projectDir, relativePath);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath, {
      force: true,
      recursive: true,
    });
  }

  if (params.cleanupBackup ?? true) {
    rmSync(snapshot.backupDir, { force: true, recursive: true });
  }
};

const assertSchemaSnippets = (
  schemaPath: string,
  expectedSchemaSnippets: readonly string[]
) => {
  const schemaSource = readFileSync(schemaPath, 'utf8');

  for (const snippet of expectedSchemaSnippets) {
    if (!schemaSource.includes(snippet)) {
      throw new Error(`Missing expected schema fragment: ${snippet}`);
    }
  }
};

const runCase = async (
  testCase: StressCase,
  params: {
    authPath: string;
    baselinePluginIds: ReadonlySet<string>;
    functionsDir: string;
    logFn: (message: string) => void;
    projectDir: string;
    runCommand: RunCommand;
    schemaPath: string;
  }
) => {
  const baseAuthSource = readFileSync(params.authPath, 'utf8');
  writeFileSync(
    params.authPath,
    patchAuthSource(baseAuthSource, testCase.extras)
  );

  const authOptions = await loadAuthOptionsFromDefinition(params.authPath);
  const pluginIds = new Set(getPluginIds(authOptions));

  for (const pluginId of params.baselinePluginIds) {
    if (!pluginIds.has(pluginId)) {
      throw new Error(
        `Auth loader dropped required base plugin "${pluginId}" in case "${testCase.name}".`
      );
    }
  }

  for (const extra of testCase.extras) {
    const pluginId = EXTRA_PLUGIN_IDS[extra];

    if (!pluginIds.has(pluginId)) {
      throw new Error(
        `Auth loader missed extra plugin "${pluginId}" in case "${testCase.name}".`
      );
    }
  }

  params.logFn(`\n[auth-schema-stress] ${testCase.name}`);
  await params.runCommand(
    ['bunx', 'better-convex', 'add', 'auth', '--schema', '--yes'],
    params.projectDir
  );
  await params.runCommand(
    ['bunx', 'better-convex', 'codegen'],
    params.projectDir
  );
  await params.runCommand(
    [
      'bunx',
      'tsc',
      '--noEmit',
      '--project',
      path.relative(
        params.projectDir,
        path.join(params.functionsDir, 'tsconfig.json')
      ),
    ],
    params.projectDir
  );
  assertSchemaSnippets(
    params.schemaPath,
    resolveExpectedSchemaSnippets(pluginIds)
  );
};

export const runAuthSchemaStress = async ({
  logFn = log,
  projectDir,
  runCommand = defaultRunCommand,
}: RunAuthSchemaStressParams) => {
  const functionsDir = resolveFunctionsDir(projectDir);
  const sharedDir = resolveSharedDir(projectDir);
  const authPath = path.join(functionsDir, 'auth.ts');
  const schemaPath = path.join(functionsDir, 'schema.ts');
  const snapshot = createSnapshot(projectDir, functionsDir, sharedDir);
  const baselinePluginIds = new Set(
    getPluginIds(await loadAuthOptionsFromDefinition(authPath))
  );

  try {
    for (const testCase of CASES) {
      restoreSnapshot(projectDir, snapshot, functionsDir, sharedDir, {
        cleanupBackup: false,
      });
      await runCase(testCase, {
        authPath,
        baselinePluginIds,
        functionsDir,
        logFn,
        projectDir,
        runCommand,
        schemaPath,
      });
    }
  } finally {
    restoreSnapshot(projectDir, snapshot, functionsDir, sharedDir);
  }

  logFn(`\n[auth-schema-stress] Passed ${CASES.length} cases.`);
};

const parseProjectDirArg = (argv: string[]) => {
  const index = argv.indexOf('--project');
  if (index === -1) {
    return process.cwd();
  }

  const value = argv[index + 1];
  if (!value) {
    throw new Error('Missing value for --project.');
  }

  return path.resolve(value);
};

if (import.meta.main) {
  runAuthSchemaStress({
    projectDir: parseProjectDirArg(process.argv.slice(2)),
  }).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
    );
    process.exitCode = 1;
  });
}
