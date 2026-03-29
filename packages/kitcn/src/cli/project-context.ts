import fs from 'node:fs';
import { posix, resolve } from 'node:path';

export type DetectedProjectFramework =
  | 'next-app'
  | 'next-pages'
  | 'vite'
  | 'react-router'
  | 'tanstack-start'
  | 'manual'
  | 'astro'
  | 'gatsby'
  | 'laravel'
  | 'remix';

export type ScaffoldMode = 'next-app' | 'react';

type CommonScaffoldContext = {
  framework: DetectedProjectFramework;
  mode: ScaffoldMode;
  usesSrc: boolean;
  componentsDir: string;
  libDir: string;
  convexClientDir: string;
  tsconfigAliasPath: './*' | './src/*';
};

export type NextAppScaffoldContext = CommonScaffoldContext & {
  framework: 'next-app';
  mode: 'next-app';
  appDir: string;
  tailwindCssPath: string;
  clientSiteUrlEnvKey: 'NEXT_PUBLIC_SITE_URL';
  convexUrlEnvKey: 'NEXT_PUBLIC_CONVEX_URL';
  convexSiteUrlEnvKey: 'NEXT_PUBLIC_CONVEX_SITE_URL';
};

export type ReactScaffoldContext = CommonScaffoldContext & {
  framework: Exclude<DetectedProjectFramework, 'next-app'>;
  mode: 'react';
  appDir: null;
  clientEntryFile: string | null;
  tailwindCssPath: string | null;
  tsconfigAppFile: string | null;
  viteConfigFile: string | null;
  clientSiteUrlEnvKey: 'VITE_SITE_URL';
  convexUrlEnvKey: 'VITE_CONVEX_URL';
  convexSiteUrlEnvKey: 'VITE_CONVEX_SITE_URL';
};

export type ProjectScaffoldContext =
  | NextAppScaffoldContext
  | ReactScaffoldContext;

function isReactScaffoldFramework(
  framework: DetectedProjectFramework
): framework is ReactScaffoldContext['framework'] {
  return framework !== 'next-app';
}

const NEXT_CONFIG_FILES = [
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'next.config.cjs',
] as const;
const VITE_CONFIG_FILES = [
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
] as const;
const REACT_ROUTER_CONFIG_FILES = [
  'react-router.config.ts',
  'react-router.config.js',
  'react-router.config.mjs',
  'react-router.config.cjs',
] as const;
const ASTRO_CONFIG_FILES = [
  'astro.config.ts',
  'astro.config.js',
  'astro.config.mjs',
  'astro.config.cjs',
] as const;
const GATSBY_CONFIG_FILES = [
  'gatsby-config.ts',
  'gatsby-config.js',
  'gatsby-config.mjs',
  'gatsby-config.cjs',
] as const;
const LEADING_SLASH_RE = /^\/+/;
const TS_ALIAS_RE = /"@\/\*"\s*:\s*\[\s*"([^"]+)"\s*\]/m;

function hasAnyFile(cwd: string, relativePaths: readonly string[]): boolean {
  return relativePaths.some((relativePath) =>
    fs.existsSync(resolve(cwd, relativePath))
  );
}

function readPackageJson(cwd: string): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} | null {
  const packageJsonPath = resolve(cwd, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

function hasDependency(
  packageJson: ReturnType<typeof readPackageJson>,
  predicate: (dependency: string) => boolean
): boolean {
  if (!packageJson) {
    return false;
  }

  return [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ].some(predicate);
}

function inferUsesSrcFromComponentsJson(cwd: string): boolean | null {
  const componentsConfigPath = resolve(cwd, 'components.json');
  if (!fs.existsSync(componentsConfigPath)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(componentsConfigPath, 'utf8')) as {
    tailwind?: { css?: unknown };
  };
  const tailwindCss = raw.tailwind?.css;
  if (typeof tailwindCss !== 'string') {
    return null;
  }
  if (tailwindCss.startsWith('src/')) {
    return true;
  }
  if (!tailwindCss.startsWith('src/')) {
    return false;
  }
  return null;
}

function inferUsesSrcFromComponentRoots(cwd: string): boolean | null {
  const hasRootComponents = fs.existsSync(resolve(cwd, 'components'));
  const hasSrcComponents = fs.existsSync(resolve(cwd, 'src', 'components'));
  const hasRootLib = fs.existsSync(resolve(cwd, 'lib'));
  const hasSrcLib = fs.existsSync(resolve(cwd, 'src', 'lib'));

  if ((hasRootComponents && hasSrcComponents) || (hasRootLib && hasSrcLib)) {
    throw new Error(
      'Ambiguous scaffold roots: both src and root client directories exist.'
    );
  }

  const signals = new Set<boolean>();
  if (hasRootComponents || hasRootLib) {
    signals.add(false);
  }
  if (hasSrcComponents || hasSrcLib) {
    signals.add(true);
  }

  return signals.values().next().value ?? null;
}

function inferUsesSrcFromTsconfig(cwd: string): boolean | null {
  const tsconfigPaths = ['tsconfig.app.json', 'tsconfig.json'];
  for (const relativePath of tsconfigPaths) {
    const tsconfigPath = resolve(cwd, relativePath);
    if (!fs.existsSync(tsconfigPath)) {
      continue;
    }
    const raw = fs.readFileSync(tsconfigPath, 'utf8');
    const aliasPath = raw.match(TS_ALIAS_RE)?.[1];
    if (aliasPath === './src/*') {
      return true;
    }
    if (aliasPath === './*') {
      return false;
    }
  }
  return null;
}

function inferUsesSrcFromAppDirs(cwd: string): boolean | null {
  const hasRootApp = fs.existsSync(resolve(cwd, 'app'));
  const hasSrcApp = fs.existsSync(resolve(cwd, 'src', 'app'));
  if (hasRootApp && hasSrcApp) {
    throw new Error('Ambiguous scaffold roots: both app and src/app exist.');
  }
  if (hasSrcApp) {
    return true;
  }
  if (hasRootApp) {
    return false;
  }
  return null;
}

function inferUsesSrc(cwd: string, mode: ScaffoldMode): boolean {
  const signals = [
    inferUsesSrcFromComponentsJson(cwd),
    mode === 'next-app' ? inferUsesSrcFromAppDirs(cwd) : null,
    inferUsesSrcFromComponentRoots(cwd),
    inferUsesSrcFromTsconfig(cwd),
    fs.existsSync(resolve(cwd, 'src')) ? true : null,
  ].filter((value): value is boolean => value !== null);

  const distinct = [...new Set(signals)];
  if (distinct.length > 1) {
    throw new Error(
      'Ambiguous scaffold roots: conflicting src and root project signals exist.'
    );
  }

  return distinct[0] ?? false;
}

function resolveReactClientEntryFile(
  cwd: string,
  usesSrc: boolean
): string | null {
  const candidates = usesSrc
    ? ['src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js']
    : ['main.tsx', 'main.jsx', 'main.ts', 'main.js'];

  const match = candidates.find((relativePath) =>
    fs.existsSync(resolve(cwd, relativePath))
  );
  return match ? match.replaceAll('\\', '/') : null;
}

export function detectProjectFramework(
  cwd = process.cwd()
): DetectedProjectFramework | null {
  const packageJson = readPackageJson(cwd);

  if (hasAnyFile(cwd, NEXT_CONFIG_FILES)) {
    return fs.existsSync(resolve(cwd, 'app')) ||
      fs.existsSync(resolve(cwd, 'src', 'app'))
      ? 'next-app'
      : 'next-pages';
  }
  if (hasAnyFile(cwd, ASTRO_CONFIG_FILES)) {
    return 'astro';
  }
  if (hasAnyFile(cwd, GATSBY_CONFIG_FILES)) {
    return 'gatsby';
  }
  if (fs.existsSync(resolve(cwd, 'composer.json'))) {
    return 'laravel';
  }
  if (
    hasDependency(packageJson, (dependency) =>
      dependency.startsWith('@remix-run/')
    )
  ) {
    return 'remix';
  }
  if (
    hasDependency(packageJson, (dependency) =>
      dependency.startsWith('@tanstack/react-start')
    )
  ) {
    return 'tanstack-start';
  }
  if (hasAnyFile(cwd, REACT_ROUTER_CONFIG_FILES)) {
    return 'react-router';
  }
  if (hasAnyFile(cwd, VITE_CONFIG_FILES)) {
    return 'vite';
  }
  if (
    hasDependency(
      packageJson,
      (dependency) => dependency === 'react' || dependency === 'react-dom'
    )
  ) {
    return 'manual';
  }
  return null;
}

export function mapFrameworkToScaffoldMode(
  framework: DetectedProjectFramework
): ScaffoldMode {
  if (framework === 'next-app') {
    return 'next-app';
  }
  if (
    framework === 'next-pages' ||
    framework === 'vite' ||
    framework === 'react-router' ||
    framework === 'tanstack-start' ||
    framework === 'manual'
  ) {
    return 'react';
  }
  throw new Error(
    `Unsupported framework "${framework}" for kitcn init. Supported frameworks map to: next-app, next-pages, vite, react-router, tanstack-start, manual.`
  );
}

export function resolveProjectScaffoldContext(
  params: {
    cwd?: string;
    template?: string;
    allowMissing?: boolean;
    allowUnsupported?: boolean;
  } = {}
): ProjectScaffoldContext | null {
  const cwd = params.cwd ?? process.cwd();
  const detectedFramework =
    detectProjectFramework(cwd) ??
    (params.template === 'next'
      ? 'next-app'
      : params.template === 'vite'
        ? 'vite'
        : null);

  if (!detectedFramework) {
    if (params.allowMissing) {
      return null;
    }
    throw new Error(
      'Could not detect a supported app scaffold. Supported modes currently start from `next` or `vite`.'
    );
  }

  let mode: ScaffoldMode;
  try {
    mode = mapFrameworkToScaffoldMode(detectedFramework);
  } catch (error) {
    if (params.allowUnsupported) {
      return null;
    }
    throw error;
  }
  const usesSrc = inferUsesSrc(cwd, mode);
  const rootPrefix = usesSrc ? 'src' : '';
  const componentsDir = posix
    .join(rootPrefix, 'components')
    .replace(LEADING_SLASH_RE, '');
  const libDir = posix.join(rootPrefix, 'lib').replace(LEADING_SLASH_RE, '');
  const convexClientDir = posix.join(libDir, 'convex');
  const tsconfigAliasPath = usesSrc ? './src/*' : './*';

  if (mode === 'next-app') {
    const appDir = posix.join(rootPrefix, 'app').replace(LEADING_SLASH_RE, '');
    return {
      framework: 'next-app',
      mode,
      usesSrc,
      appDir,
      componentsDir,
      libDir,
      convexClientDir,
      tailwindCssPath: `${appDir}/globals.css`,
      tsconfigAliasPath,
      clientSiteUrlEnvKey: 'NEXT_PUBLIC_SITE_URL',
      convexUrlEnvKey: 'NEXT_PUBLIC_CONVEX_URL',
      convexSiteUrlEnvKey: 'NEXT_PUBLIC_CONVEX_SITE_URL',
    };
  }

  const clientEntryFile = resolveReactClientEntryFile(cwd, usesSrc);
  const viteConfigFile = VITE_CONFIG_FILES.find((relativePath) =>
    fs.existsSync(resolve(cwd, relativePath))
  );
  const tsconfigAppFile = ['tsconfig.app.json', 'tsconfig.json'].find(
    (relativePath) => fs.existsSync(resolve(cwd, relativePath))
  );
  const tailwindCssPath = inferUsesSrcFromComponentsJson(cwd)
    ? usesSrc
      ? 'src/index.css'
      : 'index.css'
    : fs.existsSync(resolve(cwd, usesSrc ? 'src/index.css' : 'index.css'))
      ? usesSrc
        ? 'src/index.css'
        : 'index.css'
      : null;

  if (!isReactScaffoldFramework(detectedFramework)) {
    throw new Error(
      `Expected react scaffold framework, got "${detectedFramework}".`
    );
  }

  return {
    framework: detectedFramework,
    mode,
    usesSrc,
    appDir: null,
    componentsDir,
    libDir,
    convexClientDir,
    clientEntryFile,
    tailwindCssPath,
    tsconfigAppFile: tsconfigAppFile ?? null,
    viteConfigFile: viteConfigFile ?? null,
    tsconfigAliasPath,
    clientSiteUrlEnvKey: 'VITE_SITE_URL',
    convexUrlEnvKey: 'VITE_CONVEX_URL',
    convexSiteUrlEnvKey: 'VITE_CONVEX_SITE_URL',
  };
}
