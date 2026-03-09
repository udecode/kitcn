import { parse } from 'dotenv';

const INIT_NEXT_ENV_LOCAL_DEFAULTS = {
  NEXT_PUBLIC_CONVEX_URL: 'http://127.0.0.1:3210',
  NEXT_PUBLIC_CONVEX_SITE_URL: 'http://127.0.0.1:3211',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
} as const;

export function renderInitNextEnvLocalTemplate(source?: string): string {
  const existing = source ? parse(source) : {};
  const lines = Object.entries(INIT_NEXT_ENV_LOCAL_DEFAULTS).map(
    ([key, value]) => `${key}=${existing[key] ?? value}`
  );

  for (const [key, value] of Object.entries(existing)) {
    if (!(key in INIT_NEXT_ENV_LOCAL_DEFAULTS)) {
      lines.push(`${key}=${value}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
