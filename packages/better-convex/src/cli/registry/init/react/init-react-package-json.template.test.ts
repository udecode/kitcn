import { renderInitReactPackageJsonTemplate } from './init-react-package-json.template';

describe('init-react-package-json.template', () => {
  test('adds Better Convex baseline scripts when script names are free', () => {
    const rendered = renderInitReactPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
      })
    );

    expect(JSON.parse(rendered)).toMatchObject({
      scripts: {
        codegen: 'better-convex codegen',
        'convex:dev': 'better-convex dev',
        'typecheck:convex': 'tsc --noEmit --project convex/tsconfig.json',
        typecheck: 'tsc --noEmit && bun run typecheck:convex',
      },
      devDependencies: {
        '@types/bun': 'latest',
      },
    });
  });

  test('adds @concavejs/cli for concave scaffolds', () => {
    const rendered = renderInitReactPackageJsonTemplate(
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
