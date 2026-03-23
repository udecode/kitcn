import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeGeneratedConcaveApiTypes } from '../packages/better-convex/src/cli/concave-api-types';
import { TEMPLATE_KEYS } from './template.config';

const PROJECT_ROOT = process.cwd();

const getFunctionsDir = (directory: string) => {
  const convexConfigPath = path.join(directory, 'convex.json');
  if (!existsSync(convexConfigPath)) {
    return path.join(directory, 'convex');
  }
  const convexConfig = JSON.parse(readFileSync(convexConfigPath, 'utf8')) as {
    functions?: string;
  };
  return path.join(directory, convexConfig.functions ?? 'convex');
};

for (const templateKey of TEMPLATE_KEYS) {
  const templateDir = path.join(PROJECT_ROOT, 'fixtures', templateKey);
  if (!existsSync(templateDir)) {
    continue;
  }
  writeGeneratedConcaveApiTypes(getFunctionsDir(templateDir));
}
