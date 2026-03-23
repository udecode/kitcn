import { renderEnvHelperContent } from './planner';

describe('cli registry planner', () => {
  test('defaults SITE_URL to localhost:3000 in the generated env helper', () => {
    expect(renderEnvHelperContent([])).toContain(
      "SITE_URL: z.string().default('http://localhost:3000')"
    );
  });
});
