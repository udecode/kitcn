import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planAffected } from './check.mjs';
import { openCache } from './check-cache.mjs';

const needed = (files: string[]) =>
  planAffected(files)
    .filter((entry) => entry.needed)
    .map((entry) => entry.step.name);

describe('bun check --affected', () => {
  test('a change to plans and agent files runs no step', () => {
    expect(
      needed([
        'docs/plans/x.md',
        'AGENTS.md',
        '.agents/rules/verify.mdc',
        '.agents/pstack/land.mjs',
        '.claude/skills/verify/SKILL.md',
      ])
    ).toEqual([]);
  });

  test("CI's push trigger ignores only paths no step reads", () => {
    const workflow = readFileSync(
      path.join(import.meta.dir, '../.github/workflows/ci.yml'),
      'utf-8'
    );
    const ignored = [
      ...(
        workflow.match(/paths-ignore:\n((?:\s+- .+\n)+)/u)?.[1] ?? ''
      ).matchAll(/- '([^']+)'/gu),
    ].map(([, glob]) => glob.replace('/**', '/x/index.ts'));
    expect(ignored.length).toBeGreaterThan(0);
    for (const file of ignored)
      expect([file, needed([file])]).toEqual([file, []]);
  });

  test('a package source change runs the build and every test step', () => {
    expect(needed(['packages/kitcn/src/orm/query.ts'])).toEqual(
      expect.arrayContaining([
        'build',
        'test-bun',
        'test-vitest',
        'test-cli',
        'test-concave',
        'fixtures',
        'scenario-verify',
        'scenario-runtime',
      ])
    );
  });

  test('a change to the lockfile runs every step', () => {
    expect(needed(['bun.lock'])).toHaveLength(planAffected([]).length);
  });
});

const roots: string[] = [];
afterEach(() => {
  for (const dir of roots.splice(0))
    rmSync(dir, { force: true, recursive: true });
});

const repo = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'kitcn-check-test-'));
  roots.push(dir);
  const git = (...args: string[]) =>
    spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
  git('init', '-q');
  git('config', 'user.email', 'check@test');
  git('config', 'user.name', 'check');
  writeFileSync(path.join(dir, 'a.ts'), 'export const a = 1;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return dir;
};
const scope = { command: 'bun lint', filesOnly: true, name: 'lint' };
const pass = (dir: string) => {
  const cache = openCache(dir);
  cache.stampFiles();
  cache.begin('lint');
  cache.end(scope, { passed: true, seconds: 1 });
  return cache.flush();
};

describe('check pass cache', () => {
  test('a pass covers a later run on the same files', () => {
    const dir = repo();
    expect(pass(dir).written).toBe(1);
    expect(
      openCache(dir)
        .bases(scope)
        .map((base) => base.kind)
    ).toEqual(['exact']);
  });

  test('an edited file loses the pass and names the file', () => {
    const dir = repo();
    pass(dir);
    writeFileSync(path.join(dir, 'a.ts'), 'export const a = 2;\n');
    const cache = openCache(dir);
    expect(cache.bases(scope)).toEqual([]);
    expect(
      cache.bases(scope, { near: true }).map((base) => base.files)
    ).toEqual([['a.ts']]);
  });

  test('a file written while the check runs records no pass', () => {
    const dir = repo();
    const cache = openCache(dir);
    cache.stampFiles();
    cache.begin('lint');
    writeFileSync(path.join(dir, 'a.ts'), 'export const a = 1;\n');
    cache.end(scope, { passed: true, seconds: 1 });
    expect(cache.flush().written).toBe(0);
    expect(openCache(dir).bases(scope)).toEqual([]);
  });

  test('a fresh run ignores recorded passes', () => {
    const dir = repo();
    pass(dir);
    expect(openCache(dir, { fresh: true }).bases(scope)).toEqual([]);
  });
});
