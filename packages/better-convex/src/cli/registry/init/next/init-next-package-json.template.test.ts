import { renderInitNextPackageJsonTemplate } from './init-next-package-json.template';

describe('init-next-package-json.template', () => {
  test('adds Better Convex baseline scripts when script names are free', () => {
    const rendered = renderInitNextPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
        scripts: {
          dev: 'custom-dev',
        },
      })
    );

    expect(JSON.parse(rendered)).toMatchObject({
      scripts: {
        dev: 'next dev --turbopack',
        'convex:dev': 'better-convex dev',
        codegen: 'better-convex codegen',
        'typecheck:convex':
          'tsc --noEmit --project convex/functions/tsconfig.json',
        typecheck: 'tsc --noEmit && bun run typecheck:convex',
      },
      devDependencies: {
        '@types/bun': 'latest',
      },
    });
  });

  test('falls back to convex:codegen when codegen already exists', () => {
    const rendered = renderInitNextPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
        scripts: {
          codegen: 'some-other-generator',
        },
      })
    );

    expect(JSON.parse(rendered)).toMatchObject({
      scripts: {
        codegen: 'some-other-generator',
        'convex:codegen': 'better-convex codegen',
        'convex:dev': 'better-convex dev',
        'typecheck:convex':
          'tsc --noEmit --project convex/functions/tsconfig.json',
        typecheck: 'tsc --noEmit && bun run typecheck:convex',
      },
      devDependencies: {
        '@types/bun': 'latest',
      },
    });
  });

  test('uses the resolved functions dir for Convex typecheck scripts', () => {
    const rendered = renderInitNextPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
      }),
      {
        functionsDirRelative: 'convex',
      }
    );

    expect(JSON.parse(rendered)).toMatchObject({
      scripts: {
        'typecheck:convex': 'tsc --noEmit --project convex/tsconfig.json',
      },
    });
  });

  test('adds @concavejs/cli for concave scaffolds', () => {
    const rendered = renderInitNextPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
      }),
      {
        backend: 'concave',
      }
    );

    expect(JSON.parse(rendered)).toMatchObject({
      devDependencies: {
        '@concavejs/cli': 'latest',
        '@types/bun': 'latest',
      },
    });
  });
});
