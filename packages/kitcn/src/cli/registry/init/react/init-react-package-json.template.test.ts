import { renderInitReactPackageJsonTemplate } from './init-react-package-json.template';

describe('init-react-package-json.template', () => {
  test('adds kitcn baseline scripts when script names are free', () => {
    const rendered = renderInitReactPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
      })
    );

    expect(JSON.parse(rendered)).toMatchObject({
      scripts: {
        codegen: 'kitcn codegen',
        'convex:dev': 'kitcn dev',
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
    const rendered = renderInitReactPackageJsonTemplate(
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
