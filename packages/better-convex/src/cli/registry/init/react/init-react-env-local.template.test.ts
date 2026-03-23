import { renderInitReactEnvLocalTemplate } from './init-react-env-local.template';

describe('init-react-env-local.template', () => {
  test('defaults the local app URL to port 3000', () => {
    const rendered = renderInitReactEnvLocalTemplate();

    expect(rendered).toContain('VITE_SITE_URL=http://localhost:3000');
    expect(rendered).toContain('VITE_CONVEX_URL=http://127.0.0.1:3210');
  });

  test('preserves an existing app URL', () => {
    const rendered = renderInitReactEnvLocalTemplate(
      'VITE_SITE_URL=http://localhost:4000\n'
    );

    expect(rendered).toContain('VITE_SITE_URL=http://localhost:4000');
  });
});
