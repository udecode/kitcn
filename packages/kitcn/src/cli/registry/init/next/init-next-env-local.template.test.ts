import { renderInitNextEnvLocalTemplate } from './init-next-env-local.template';

describe('init-next-env-local.template', () => {
  test('defaults the local app URL to port 3000', () => {
    const rendered = renderInitNextEnvLocalTemplate();

    expect(rendered).toContain('NEXT_PUBLIC_SITE_URL=http://localhost:3000');
    expect(rendered).toContain('NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210');
  });

  test('preserves an existing app URL', () => {
    const rendered = renderInitNextEnvLocalTemplate(
      'NEXT_PUBLIC_SITE_URL=http://localhost:4000\n'
    );

    expect(rendered).toContain('NEXT_PUBLIC_SITE_URL=http://localhost:4000');
  });
});
