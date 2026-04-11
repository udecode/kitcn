import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProjectJiti } from './project-jiti';

describe('cli/utils/project-jiti', () => {
  test('forces tryNative off for project parse-time imports', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-project-jiti-'));
    const previous = process.env.JITI_TRY_NATIVE;

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'project-jiti-test', private: true }, null, 2)
    );

    try {
      process.env.JITI_TRY_NATIVE = 'true';

      const jiti = createProjectJiti(dir);

      expect(jiti.options.tryNative).toBe(false);
    } finally {
      if (previous === undefined) {
        process.env.JITI_TRY_NATIVE = undefined;
      } else {
        process.env.JITI_TRY_NATIVE = previous;
      }
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });
});
