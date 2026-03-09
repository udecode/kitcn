import { renderInitNextPackageJsonTemplate } from './init-next-package-json.template';

describe('init-next-package-json.template', () => {
  test('adds codegen when the script name is free', () => {
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
        codegen: 'better-convex codegen',
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
      },
    });
  });
});
