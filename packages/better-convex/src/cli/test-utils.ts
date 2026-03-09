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

export function writeMinimalSchema(dir: string, source?: string) {
  const schemaSource =
    source ??
    `
    import { defineSchema } from "better-convex/orm";

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
