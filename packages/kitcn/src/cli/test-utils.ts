import fs from 'node:fs';
import path from 'node:path';

const LEGACY_TRAILING_COMMA_RE = /,\n(\s*[)\]}])/g;
const LEGACY_RELATIONS_INDENT_RE = /\.relations\(\(r\) => \(\{\n\s{6}/;
const LEGACY_RELATIONS_CLOSE_RE = /\n\s{6}\}\)\);\n\}/;

export const ANSI_ESCAPE_RE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`
);

export function createDefaultConfig() {
  return {
    paths: {
      lib: 'convex/lib',
      shared: 'convex/shared',
    },
    hooks: {
      postAdd: [],
    },
    dev: {
      debug: false,
      args: [],
      aggregateBackfill: {
        enabled: 'auto' as const,
        wait: true,
        batchSize: 1000,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: false,
      },
      migrations: {
        enabled: 'auto' as const,
        wait: true,
        batchSize: 256,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: false,
        allowDrift: true,
      },
    },
    codegen: {
      debug: false,
      args: [],
      trimSegments: ['plugins'],
    },
    deploy: {
      args: [],
      aggregateBackfill: {
        enabled: 'auto' as const,
        wait: true,
        batchSize: 1000,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: true,
      },
      migrations: {
        enabled: 'auto' as const,
        wait: true,
        batchSize: 256,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: true,
        allowDrift: false,
      },
    },
  };
}

export function writePackageJson(
  dir: string,
  pkg: Record<string, unknown> = { name: 'test-app', private: true }
) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(pkg, null, 2)}\n`
  );
}

export function writeShadcnNextApp(
  dir: string,
  params: { usesSrc?: boolean } = {}
) {
  const rootPrefix = params.usesSrc ? path.join('src') : '';
  const appDir = path.join(dir, rootPrefix, 'app');
  const componentsDir = path.join(dir, rootPrefix, 'components');
  const libDir = path.join(dir, rootPrefix, 'lib');
  const aliasPath = params.usesSrc ? './src/*' : './*';
  const globalsImport = './globals.css';
  const tailwindCssPath = params.usesSrc
    ? 'src/app/globals.css'
    : 'app/globals.css';

  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(componentsDir, { recursive: true });
  fs.mkdirSync(libDir, { recursive: true });

  writePackageJson(dir);

  fs.writeFileSync(
    path.join(dir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': [aliasPath],
          },
        },
      },
      null,
      2
    )}\n`
  );

  fs.writeFileSync(
    path.join(dir, 'eslint.config.mjs'),
    `import { defineConfig, globalIgnores } from "eslint/config";\nimport nextVitals from "eslint-config-next/core-web-vitals";\nimport nextTs from "eslint-config-next/typescript";\n\nconst eslintConfig = defineConfig([\n  ...nextVitals,\n  ...nextTs,\n  globalIgnores([\n    ".next/**",\n    "out/**",\n    "build/**",\n    "next-env.d.ts",\n  ]),\n]);\n\nexport default eslintConfig;\n`
  );

  fs.writeFileSync(
    path.join(dir, 'next.config.mjs'),
    `/** @type {import('next').NextConfig} */\nconst nextConfig = {}\n\nexport default nextConfig\n`
  );

  fs.writeFileSync(
    path.join(dir, 'postcss.config.mjs'),
    `/** @type {import('postcss-load-config').Config} */\nconst config = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n}\n\nexport default config\n`
  );

  fs.writeFileSync(
    path.join(dir, 'components.json'),
    `${JSON.stringify(
      {
        $schema: 'https://ui.shadcn.com/schema.json',
        style: 'base-nova',
        rsc: true,
        tsx: true,
        tailwind: {
          config: '',
          css: tailwindCssPath,
          baseColor: 'neutral',
          cssVariables: true,
          prefix: '',
        },
        aliases: {
          components: '@/components',
          utils: '@/lib/utils',
          ui: '@/components/ui',
          lib: '@/lib',
          hooks: '@/hooks',
        },
      },
      null,
      2
    )}\n`
  );

  fs.writeFileSync(
    path.join(appDir, 'layout.tsx'),
    `import { Geist, Geist_Mono } from "next/font/google"\n\nimport "${globalsImport}"\nimport { ThemeProvider } from "@/components/theme-provider"\n\nconst fontSans = Geist({\n  subsets: ["latin"],\n  variable: "--font-sans",\n})\n\nconst fontMono = Geist_Mono({\n  subsets: ["latin"],\n  variable: "--font-mono",\n})\n\nexport default function RootLayout({\n  children,\n}: Readonly<{\n  children: React.ReactNode\n}>) {\n  return (\n    <html\n      lang="en"\n      suppressHydrationWarning\n      className={\`\${fontSans.variable} \${fontMono.variable} font-sans antialiased\`}\n    >\n      <body>\n        <ThemeProvider>{children}</ThemeProvider>\n      </body>\n    </html>\n  )\n}\n`
  );

  fs.writeFileSync(
    path.join(appDir, 'page.tsx'),
    'export default function Home() {\n  return <main>shadcn page</main>\n}\n'
  );

  fs.writeFileSync(
    path.join(appDir, 'globals.css'),
    '@import "tailwindcss";\n\n@theme inline {\n  --shadcn-shell: 1;\n}\n'
  );

  fs.writeFileSync(
    path.join(componentsDir, 'theme-provider.tsx'),
    `"use client"\n\nimport * as React from "react"\nimport { ThemeProvider as NextThemesProvider } from "next-themes"\n\nexport function ThemeProvider({ children }: { children: React.ReactNode }) {\n  return <NextThemesProvider>{children}</NextThemesProvider>\n}\n`
  );

  fs.writeFileSync(
    path.join(libDir, 'utils.ts'),
    'export function cn(...classes: Array<string | false | null | undefined>) {\n  return classes.filter(Boolean).join(" ")\n}\n'
  );
}

export function writeShadcnNextMonorepoApp(dir: string) {
  const appDir = path.join(dir, 'apps', 'web');
  const uiDir = path.join(dir, 'packages', 'ui');

  writeShadcnNextApp(appDir);

  fs.mkdirSync(uiDir, { recursive: true });

  writePackageJson(dir, {
    name: 'next-monorepo',
    private: true,
    version: '0.0.1',
    packageManager: 'pnpm@9.0.6',
    scripts: {
      build: 'turbo build',
      dev: 'turbo dev',
      lint: 'turbo lint',
      format: 'turbo format',
      typecheck: 'turbo typecheck',
    },
    devDependencies: {
      '@workspace/eslint-config': 'workspace:*',
      '@workspace/typescript-config': 'workspace:*',
      prettier: '^3.8.1',
      'prettier-plugin-tailwindcss': '^0.7.2',
      turbo: '^2.8.8',
      typescript: '5.9.3',
    },
  });

  fs.writeFileSync(
    path.join(dir, 'pnpm-workspace.yaml'),
    'packages:\n  - apps/*\n  - packages/*\n'
  );
  fs.writeFileSync(
    path.join(dir, 'turbo.json'),
    `${JSON.stringify({ $schema: 'https://turbo.build/schema.json' }, null, 2)}\n`
  );

  const appPackageJsonPath = path.join(appDir, 'package.json');
  const appPackageJson = JSON.parse(
    fs.readFileSync(appPackageJsonPath, 'utf8')
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  fs.writeFileSync(
    appPackageJsonPath,
    `${JSON.stringify(
      {
        ...appPackageJson,
        dependencies: {
          ...(appPackageJson.dependencies ?? {}),
          '@workspace/ui': 'workspace:*',
        },
        devDependencies: {
          ...(appPackageJson.devDependencies ?? {}),
          '@workspace/eslint-config': 'workspace:^',
          '@workspace/typescript-config': 'workspace:*',
        },
      },
      null,
      2
    )}\n`
  );

  fs.writeFileSync(
    path.join(appDir, 'components.json'),
    `${JSON.stringify(
      {
        $schema: 'https://ui.shadcn.com/schema.json',
        style: 'radix-nova',
        rsc: true,
        tsx: true,
        tailwind: {
          config: '',
          css: '../../packages/ui/src/styles/globals.css',
          baseColor: 'neutral',
          cssVariables: true,
        },
        aliases: {
          components: '@/components',
          hooks: '@/hooks',
          lib: '@/lib',
          utils: '@workspace/ui/lib/utils',
          ui: '@workspace/ui/components',
        },
      },
      null,
      2
    )}\n`
  );

  writePackageJson(uiDir, {
    name: '@workspace/ui',
    private: true,
    version: '0.0.1',
  });
}

export function writeShadcnViteApp(
  dir: string,
  params: { usesSrc?: boolean } = {}
) {
  const usesSrc = params.usesSrc ?? true;
  const rootPrefix = usesSrc ? path.join('src') : '';
  const appDir = path.join(dir, rootPrefix);
  const componentsDir = path.join(appDir, 'components');
  const libDir = path.join(appDir, 'lib');
  const aliasPath = usesSrc ? './src/*' : './*';
  const tailwindCssPath = usesSrc ? 'src/index.css' : 'index.css';
  const mainPath = path.join(appDir, 'main.tsx');

  fs.mkdirSync(componentsDir, { recursive: true });
  fs.mkdirSync(libDir, { recursive: true });

  writePackageJson(dir, {
    name: 'vite-app',
    private: true,
    version: '0.0.1',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc -b && vite build',
      lint: 'eslint .',
      format: 'prettier --write "**/*.{ts,tsx}"',
      typecheck: 'tsc --noEmit',
      preview: 'vite preview',
    },
    dependencies: {
      '@tailwindcss/vite': '^4.1.17',
      react: '^19.2.0',
      'react-dom': '^19.2.0',
      tailwindcss: '^4.1.17',
    },
    devDependencies: {
      '@eslint/js': '^9.39.1',
      '@types/node': '^24.10.1',
      '@types/react': '^19.2.5',
      '@types/react-dom': '^19.2.3',
      '@vitejs/plugin-react': '^5.1.1',
      eslint: '^9.39.1',
      'eslint-plugin-react-hooks': '^7.0.1',
      'eslint-plugin-react-refresh': '^0.4.24',
      globals: '^16.5.0',
      prettier: '^3.8.1',
      'prettier-plugin-tailwindcss': '^0.7.2',
      typescript: '~5.9.3',
      'typescript-eslint': '^8.46.4',
      vite: '^7.2.4',
    },
  });

  fs.writeFileSync(
    path.join(dir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        files: [],
        references: [
          { path: './tsconfig.app.json' },
          { path: './tsconfig.node.json' },
        ],
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': [aliasPath],
          },
        },
      },
      null,
      2
    )}\n`
  );

  fs.writeFileSync(
    path.join(dir, 'tsconfig.app.json'),
    `{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "types": ["vite/client"],
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["${aliasPath}"]
    }
  },
  "include": ["${usesSrc ? 'src' : '.'}"]
}
`
  );

  fs.writeFileSync(
    path.join(dir, 'tsconfig.node.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          tsBuildInfoFile: './node_modules/.tmp/tsconfig.node.tsbuildinfo',
          target: 'ES2023',
          lib: ['ES2023'],
          module: 'ESNext',
          types: ['node'],
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: true,
          moduleDetection: 'force',
          noEmit: true,
        },
        include: ['vite.config.ts'],
      },
      null,
      2
    )}\n`
  );

  fs.writeFileSync(
    path.join(dir, 'vite.config.ts'),
    `import path from "path"\nimport tailwindcss from "@tailwindcss/vite"\nimport react from "@vitejs/plugin-react"\nimport { defineConfig } from "vite"\n\nexport default defineConfig({\n  plugins: [react(), tailwindcss()],\n  resolve: {\n    alias: {\n      "@": path.resolve(__dirname, "${usesSrc ? './src' : '.'}"),\n    },\n  },\n})\n`
  );

  fs.writeFileSync(
    path.join(dir, 'eslint.config.js'),
    `import js from "@eslint/js"\nimport globals from "globals"\nimport reactHooks from "eslint-plugin-react-hooks"\nimport reactRefresh from "eslint-plugin-react-refresh"\nimport tseslint from "typescript-eslint"\n\nexport default tseslint.config(\n  { ignores: ["dist"] },\n  {\n    extends: [js.configs.recommended, ...tseslint.configs.recommended],\n    files: ["**/*.{ts,tsx}"],\n    languageOptions: {\n      ecmaVersion: 2020,\n      globals: globals.browser,\n    },\n    plugins: {\n      "react-hooks": reactHooks,\n      "react-refresh": reactRefresh,\n    },\n    rules: {\n      ...reactHooks.configs.recommended.rules,\n      "react-refresh/only-export-components": [\n        "warn",\n        { allowConstantExport: true },\n      ],\n    },\n  }\n)\n`
  );

  fs.writeFileSync(
    path.join(dir, 'components.json'),
    `${JSON.stringify(
      {
        $schema: 'https://ui.shadcn.com/schema.json',
        style: 'base-nova',
        rsc: false,
        tsx: true,
        tailwind: {
          config: '',
          css: tailwindCssPath,
          baseColor: 'neutral',
          cssVariables: true,
          prefix: '',
        },
        aliases: {
          components: '@/components',
          utils: '@/lib/utils',
          ui: '@/components/ui',
          lib: '@/lib',
          hooks: '@/hooks',
        },
      },
      null,
      2
    )}\n`
  );

  fs.writeFileSync(
    mainPath,
    `import { StrictMode } from "react"\nimport { createRoot } from "react-dom/client"\n\nimport "./index.css"\nimport App from "./App.tsx"\nimport { ThemeProvider } from "@/components/theme-provider.tsx"\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <ThemeProvider>\n      <App />\n    </ThemeProvider>\n  </StrictMode>\n)\n`
  );

  fs.writeFileSync(
    path.join(appDir, 'App.tsx'),
    `export function App() {\n  return (\n    <div className="flex min-h-svh p-6">\n      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">\n        <div>\n          <h1 className="font-medium">Project ready!</h1>\n          <p>You may now add components and start building.</p>\n        </div>\n      </div>\n    </div>\n  )\n}\n\nexport default App\n`
  );

  fs.writeFileSync(path.join(appDir, 'index.css'), '@import "tailwindcss";\n');

  fs.writeFileSync(
    path.join(componentsDir, 'theme-provider.tsx'),
    `"use client"\n\nimport * as React from "react"\n\nexport function ThemeProvider({ children }: { children: React.ReactNode }) {\n  return <>{children}</>\n}\n`
  );

  fs.writeFileSync(
    path.join(libDir, 'utils.ts'),
    'export function cn(...classes: Array<string | false | null | undefined>) {\n  return classes.filter(Boolean).join(" ")\n}\n'
  );
}

export function writeShadcnStartApp(dir: string) {
  const srcDir = path.join(dir, 'src');
  const routesDir = path.join(srcDir, 'routes');
  const libDir = path.join(srcDir, 'lib');

  fs.mkdirSync(routesDir, { recursive: true });
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });

  writePackageJson(dir, {
    name: 'start-app',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite dev --port 3000',
      build: 'vite build',
      preview: 'vite preview',
      test: 'vitest run',
      lint: 'eslint',
      format: 'prettier --write "**/*.{ts,tsx,js,jsx}"',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@tailwindcss/vite': '^4.1.18',
      '@tanstack/react-devtools': '^0.7.0',
      '@tanstack/react-router': '^1.132.0',
      '@tanstack/react-router-devtools': '^1.132.0',
      '@tanstack/react-router-ssr-query': '^1.131.7',
      '@tanstack/react-start': '^1.132.0',
      '@tanstack/router-plugin': '^1.132.0',
      nitro: 'latest',
      react: '^19.2.0',
      'react-dom': '^19.2.0',
      tailwindcss: '^4.0.6',
      'vite-tsconfig-paths': '^5.1.4',
    },
    devDependencies: {
      '@tanstack/devtools-vite': '^0.3.11',
      '@tanstack/eslint-config': '^0.3.0',
      '@testing-library/dom': '^10.4.0',
      '@testing-library/react': '^16.2.0',
      '@types/node': '^22.10.2',
      '@types/react': '^19.2.0',
      '@types/react-dom': '^19.2.0',
      '@vitejs/plugin-react': '^5.0.4',
      jsdom: '^27.0.0',
      prettier: '^3.5.3',
      'prettier-plugin-tailwindcss': '^0.7.2',
      typescript: '^5.7.2',
      vite: '^7.1.7',
      vitest: '^3.0.5',
      'web-vitals': '^5.1.0',
    },
  });

  fs.writeFileSync(
    path.join(dir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['./src/*'],
          },
        },
      },
      null,
      2
    )}\n`
  );

  fs.writeFileSync(
    path.join(dir, 'components.json'),
    `${JSON.stringify(
      {
        $schema: 'https://ui.shadcn.com/schema.json',
        style: 'base-nova',
        rsc: false,
        tsx: true,
        tailwind: {
          config: '',
          css: 'src/styles.css',
          baseColor: 'neutral',
          cssVariables: true,
          prefix: '',
        },
        aliases: {
          components: '@/components',
          utils: '@/lib/utils',
          ui: '@/components/ui',
          lib: '@/lib',
          hooks: '@/hooks',
        },
      },
      null,
      2
    )}\n`
  );

  fs.writeFileSync(path.join(dir, 'eslint.config.js'), 'export default [];\n');

  fs.writeFileSync(
    path.join(dir, 'vite.config.ts'),
    `import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [tsConfigPaths(), tanstackStart(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
`
  );

  fs.writeFileSync(
    path.join(srcDir, 'lib', 'utils.ts'),
    'export function cn(...classes: Array<string | false | null | undefined>) {\n  return classes.filter(Boolean).join(" ")\n}\n'
  );

  fs.writeFileSync(
    path.join(srcDir, 'styles.css'),
    '@import "tailwindcss";\n\n@theme inline {\n  --shadcn-shell: 1;\n}\n'
  );

  fs.writeFileSync(
    path.join(srcDir, 'router.tsx'),
    `import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
`
  );

  fs.writeFileSync(
    path.join(srcDir, 'routeTree.gen.ts'),
    'export const routeTree = {} as never;\n'
  );

  fs.writeFileSync(
    path.join(routesDir, '__root.tsx'),
    `import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "TanStack Start Starter",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <div>root</div>;
}
`
  );

  fs.writeFileSync(
    path.join(routesDir, 'index.tsx'),
    `import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  return <main>shadcn start</main>;
}
`
  );
}

export function writeMinimalSchema(dir: string, source?: string) {
  const schemaSource =
    source ??
    `
    import { defineSchema } from "kitcn/orm";

    export default defineSchema({});
    `.trim();
  fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'convex', 'schema.ts'), `${schemaSource}\n`);
}

export function formatAsLegacySingleQuoteTs(source: string) {
  return source
    .replaceAll('"', "'")
    .replace(LEGACY_TRAILING_COMMA_RE, '\n$1')
    .replace(LEGACY_RELATIONS_INDENT_RE, '.relations((r) => ({\n    ')
    .replace(LEGACY_RELATIONS_CLOSE_RE, '\n  }));\n}');
}
