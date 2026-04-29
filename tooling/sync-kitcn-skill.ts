import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dir, '..');
const SOURCE_DIR = path.join(
  PROJECT_ROOT,
  'packages',
  'kitcn',
  'skills',
  'kitcn'
);
const TARGET_DIR = path.join(PROJECT_ROOT, '.agents', 'skills', 'kitcn');

if (!existsSync(SOURCE_DIR)) {
  throw new Error(`Missing kitcn skill source: ${SOURCE_DIR}`);
}

rmSync(TARGET_DIR, {
  force: true,
  recursive: true,
});

mkdirSync(path.dirname(TARGET_DIR), {
  recursive: true,
});

cpSync(SOURCE_DIR, TARGET_DIR, {
  recursive: true,
});

process.stdout.write(
  'Synced packages/kitcn/skills/kitcn to .agents/skills/kitcn\n'
);
