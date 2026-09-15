import { renderInitNextPackageJsonTemplate } from './init-next-package-json.template';

describe('init-next-package-json.template', () => {
  test('adds kitcn baseline scripts when script names are free', () => {
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
      dependencies: {
        '@opentelemetry/api': '1.9.0',
        superjson: '2.2.6',
      },
      scripts: {
        dev: 'next dev --turbopack',
        'convex:dev': 'kitcn dev',
        codegen: 'kitcn codegen',
        'typecheck:convex':
          'tsc --noEmit --project convex/functions/tsconfig.json',
        typecheck: 'tsc --noEmit && bun run typecheck:convex',
      },
      devDependencies: {
        '@types/bun': 'latest',
      },
    });
  });

  test('pins ESLint 9 for deterministic Next scaffolds', () => {
    const rendered = renderInitNextPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
        devDependencies: {
          eslint: '^9',
          'eslint-config-next': '16.3.4',
        },
      })
    );

    expect(JSON.parse(rendered)).toMatchObject({
      devDependencies: {
        eslint: '9.39.5',
        'eslint-config-next': '16.3.4',
      },
    });
  });

  test('preserves the ESLint 8 stack for supported Next 14 apps', () => {
    const rendered = renderInitNextPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
        devDependencies: {
          eslint: '^8.57.0',
          'eslint-config-next': '14.2.35',
        },
      })
    );

    expect(JSON.parse(rendered)).toMatchObject({
      devDependencies: {
        eslint: '^8.57.0',
        'eslint-config-next': '14.2.35',
      },
    });
  });

  test('normalizes ESLint when eslint-config-next is a dependency', () => {
    const rendered = renderInitNextPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
        dependencies: {
          'eslint-config-next': '16.3.4',
        },
        devDependencies: {
          eslint: '^9',
        },
      })
    );

    expect(JSON.parse(rendered)).toMatchObject({
      dependencies: {
        'eslint-config-next': '16.3.4',
      },
      devDependencies: {
        eslint: '9.39.5',
      },
    });
  });

  test('normalizes ESLint for nonnumeric current Next specs', () => {
    const rendered = renderInitNextPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
        dependencies: {
          next: 'latest',
        },
        devDependencies: {
          eslint: '^9',
          'eslint-config-next': 'latest',
        },
      })
    );

    expect(JSON.parse(rendered)).toMatchObject({
      devDependencies: {
        eslint: '9.39.5',
      },
    });
  });

  test('preserves ESLint 8 when a nonnumeric config spec targets Next 14', () => {
    const rendered = renderInitNextPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
        dependencies: {
          next: '^14.2.35',
        },
        devDependencies: {
          eslint: '^8.57.0',
          'eslint-config-next': 'catalog:',
        },
      })
    );

    expect(JSON.parse(rendered)).toMatchObject({
      devDependencies: {
        eslint: '^8.57.0',
      },
    });
  });

  test('moves normalized ESLint out of production dependencies', () => {
    const rendered = renderInitNextPackageJsonTemplate(
      JSON.stringify({
        name: 'app',
        private: true,
        dependencies: {
          eslint: '^9',
          next: '16.3.4',
        },
        devDependencies: {
          'eslint-config-next': '16.3.4',
        },
      })
    );
    const packageJson = JSON.parse(rendered) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(packageJson.dependencies.eslint).toBeUndefined();
    expect(packageJson.devDependencies.eslint).toBe('9.39.5');
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
      dependencies: {
        '@opentelemetry/api': '1.9.0',
        superjson: '2.2.6',
      },
      scripts: {
        codegen: 'some-other-generator',
        'convex:codegen': 'kitcn codegen',
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
      dependencies: {
        '@opentelemetry/api': '1.9.0',
        superjson: '2.2.6',
      },
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
      dependencies: {
        '@opentelemetry/api': '1.9.0',
        superjson: '2.2.6',
      },
      devDependencies: {
        '@concavejs/cli': '0.0.1-alpha.14',
        '@types/bun': 'latest',
      },
    });
  });
});
