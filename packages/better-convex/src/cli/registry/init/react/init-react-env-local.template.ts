import { parse } from 'dotenv';

const INIT_REACT_ENV_LOCAL_DEFAULTS = {
  VITE_CONVEX_URL: 'http://127.0.0.1:3210',
  VITE_CONVEX_SITE_URL: 'http://127.0.0.1:3211',
  VITE_SITE_URL: 'http://localhost:3000',
} as const;

export function renderInitReactEnvLocalTemplate(source?: string): string {
  const existing = source ? parse(source) : {};
  const lines = Object.entries(INIT_REACT_ENV_LOCAL_DEFAULTS).map(
    ([key, value]) => `${key}=${existing[key] ?? value}`
  );

  for (const [key, value] of Object.entries(existing)) {
    if (!(key in INIT_REACT_ENV_LOCAL_DEFAULTS)) {
      lines.push(`${key}=${value}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
