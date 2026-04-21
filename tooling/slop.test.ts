import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { formatDeltaSummary, resolveMergeBase } from './slop';

const runGit = (cwd: string, args: string[]) => {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
};

describe('tooling/slop', () => {
  test('formats regressions and improvements in a compact summary', () => {
    const summary = formatDeltaSummary(
      {
        paths: [
          {
            addedCount: 1,
            changes: [
              {
                base: null,
                head: {
                  message: 'Found 1 pass-through wrapper',
                  primaryLocation: {
                    line: 12,
                  },
                },
                ruleId: 'structure.pass-through-wrappers',
                status: 'added',
              },
            ],
            improvedCount: 0,
            path: 'src/service.ts',
            resolvedCount: 0,
            scoreDelta: 2.5,
            worsenedCount: 0,
          },
          {
            addedCount: 0,
            changes: [],
            improvedCount: 1,
            path: 'src/cleanup.ts',
            resolvedCount: 0,
            scoreDelta: -1.5,
            worsenedCount: 0,
          },
        ],
        rules: [
          {
            addedCount: 1,
            family: 'structure',
            improvedCount: 0,
            resolvedCount: 0,
            ruleId: 'structure.pass-through-wrappers',
            worsenedCount: 0,
          },
          {
            addedCount: 0,
            family: 'defensive',
            improvedCount: 1,
            resolvedCount: 0,
            ruleId: 'defensive.async-noise',
            worsenedCount: 0,
          },
        ],
        summary: {
          addedCount: 1,
          baseFindingCount: 2,
          baseRepoScore: 3,
          hasChanges: true,
          headFindingCount: 2,
          headRepoScore: 4,
          improvedCount: 1,
          netFindingCount: 0,
          netRepoScore: 1,
          resolvedCount: 0,
          worsenedCount: 0,
        },
        warnings: [],
      },
      {
        baseLabel: 'origin/main @ abc123',
        headLabel: '/repo',
        top: 4,
      }
    );

    expect(summary).toContain('deslop slop delta');
    expect(summary).toContain('Top regressions:');
    expect(summary).toContain('structure.pass-through-wrappers');
    expect(summary).toContain('Hot paths to clean:');
    expect(summary).toContain('src/service.ts');
    expect(summary).toContain('Largest improvements:');
    expect(summary).toContain('defensive.async-noise');
    expect(summary).toContain('Paths already improved:');
    expect(summary).toContain('src/cleanup.ts');
  });

  test('prints a no-change footer when delta is clean', () => {
    const summary = formatDeltaSummary({
      paths: [],
      rules: [],
      summary: {
        addedCount: 0,
        baseFindingCount: 1,
        baseRepoScore: 2,
        hasChanges: false,
        headFindingCount: 1,
        headRepoScore: 2,
        improvedCount: 0,
        netFindingCount: 0,
        netRepoScore: 0,
        resolvedCount: 0,
        worsenedCount: 0,
      },
      warnings: [],
    });

    expect(summary).toContain('No occurrence-level changes.');
  });

  test('throws when merge-base cannot resolve the base ref', () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), 'kitcn-slop-test-'));

    try {
      runGit(repo, ['init']);
      writeFileSync(path.join(repo, 'file.txt'), 'hello\n');
      runGit(repo, ['add', 'file.txt']);
      runGit(repo, [
        '-c',
        'user.email=test@example.com',
        '-c',
        'user.name=Test',
        'commit',
        '-m',
        'init',
      ]);

      expect(() => resolveMergeBase(repo, 'missing/ref')).toThrow(
        /Could not resolve git merge-base for missing\/ref/
      );
    } finally {
      rmSync(repo, { force: true, recursive: true });
    }
  });
});
