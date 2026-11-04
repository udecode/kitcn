import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const VERSION = 'v1';
const UPSTREAM = 'refs/remotes/origin/main';
const KEEP_DAYS = 14;
const KEEP_PER_KEY = 64;
const NEAR = 8;
const FLUSH_SECONDS = 120;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WRITE_GRACE = HOUR;
const RESULT_ENV =
  /^(?:CI|TZ|LANG|LC_ALL|LC_COLLATE|NODE_ENV|NODE_OPTIONS|BUN_OPTIONS|(?:KITCN|CONVEX)_\w+)$/u;

/**
 * @typedef {{ name: string, command: string, cache?: boolean, filesOnly?: boolean }} Scope
 * @typedef {{ kind: 'exact' | 'pass' | 'merge-base', files: string[], label: string }} Base
 */

export const freshRun = (env) =>
  !['', '0', 'false', undefined].includes(env.CHECK_FRESH);

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const entries = (text) => text.split('\0').filter(Boolean);
const lines = (text) => text.trim().split('\n');
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const gitIn =
  (root) =>
  (args, { env } = {}) =>
    spawnSync('git', args, {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      maxBuffer: 1024 * 1024 * 256,
    });
const must = (git, args, options) => {
  const result = git(args, options);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
};

const trackedFiles = (root) =>
  entries(
    must(gitIn(root), [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
    ])
  );

const workTree = (git, index) => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'check-cache-'));
  try {
    const env = { GIT_INDEX_FILE: path.join(scratch, 'index') };
    if (existsSync(index)) {
      writeFileSync(env.GIT_INDEX_FILE, readFileSync(index));
    } else {
      must(git, ['read-tree', 'HEAD'], { env });
    }
    must(git, ['add', '-A'], { env });
    return must(git, ['write-tree'], { env }).trim();
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
};

const snapshot = (root) => {
  const git = gitIn(root);
  const [index, head] = lines(
    must(git, [
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'index',
      'HEAD^{tree}',
    ])
  );
  const fields = entries(
    must(git, [
      '--no-optional-locks',
      'status',
      '--porcelain',
      '-z',
      '--untracked-files=all',
    ])
  );
  const membership = [];
  let source = false;
  for (const field of fields) {
    // A rename or copy names its source in the next field.
    if (source) {
      source = false;
      continue;
    }
    const [x, y] = field;
    if (x === '?') membership.push(`?${field.slice(3)}`);
    else if (y === 'D') membership.push(`-${field.slice(3)}`);
    source = 'RC'.includes(x) || 'RC'.includes(y);
  }
  return {
    head,
    index: membership.sort(byCodeUnit),
    work: fields.length === 0 ? head : workTree(git, index),
  };
};

const statLine = (root, file) => {
  const stat = lstatSync(path.join(root, file), {
    bigint: true,
    throwIfNoEntry: false,
  });
  return stat
    ? `${stat.ino} ${stat.size} ${stat.mtimeNs} ${stat.ctimeNs}`
    : 'missing';
};

const statAll = (root) =>
  new Map(trackedFiles(root).map((file) => [file, statLine(root, file)]));

const stateId = ({ head, index, work }, filesOnly) =>
  sha256(JSON.stringify(filesOnly ? [work] : [work, head, index])).slice(0, 40);

const mergeBaseState = (root) => {
  const git = gitIn(root);
  const base = git(['merge-base', 'HEAD', UPSTREAM]);
  if (base.status !== 0) {
    throw new Error(
      'no merge base with origin/main; run git fetch origin main.'
    );
  }
  const tree = must(git, ['rev-parse', `${base.stdout.trim()}^{tree}`]).trim();
  return { head: tree, index: [], work: tree };
};

const list = (dir) => {
  try {
    return readdirSync(dir);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
    throw error;
  }
};

// git ignores these files, yet they change what the tests see.
const ENV_DIRS = ['.', 'example', 'example/convex', 'www'];
const dotenv = (root) =>
  sha256(
    JSON.stringify(
      ENV_DIRS.flatMap((dir) =>
        list(path.join(root, dir))
          .filter(
            (name) =>
              name.startsWith('.env') &&
              statSync(path.join(root, dir, name), {
                throwIfNoEntry: false,
              })?.isFile()
          )
          .sort(byCodeUnit)
          .map((name) => [
            path.join(dir, name),
            readFileSync(path.join(root, dir, name), 'utf-8'),
          ])
      )
    )
  );

let bunVersion;
const globalPart = (root, env) => {
  bunVersion ??= (() => {
    const result = spawnSync('bun', ['--version'], { encoding: 'utf-8' });
    return result.status === 0 ? result.stdout.trim() : 'none';
  })();
  const lock = path.join(root, 'bun.lock');
  return {
    bun: bunVersion,
    dotenv: dotenv(root),
    env: Object.entries(env)
      .filter(([name]) => RESULT_ENV.test(name))
      .sort(([a], [b]) => byCodeUnit(a, b)),
    lock: existsSync(lock) ? sha256(readFileSync(lock)) : 'none',
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  };
};

const readRecord = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch (error) {
    // A power loss can leave an empty file behind the rename.
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
};
const mtime = (file) => statSync(file, { throwIfNoEntry: false })?.mtimeMs;

const ago = (at) => {
  const minutes = Math.round((Date.now() - Date.parse(at)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 120) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

const writeAtomically = (file, text) => {
  const dir = path.dirname(file);
  const temp = path.join(
    dir,
    `.${path.basename(file)}.${process.pid}.${randomBytes(6).toString('hex')}`
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(temp, text);
  renameSync(temp, file);
};

const sweep = (store) => {
  const mark = path.join(store, '.swept');
  if (Date.now() - (mtime(mark) ?? 0) < DAY) return;
  writeFileSync(mark, '');
  const versions = path.dirname(store);
  for (const version of list(versions)) {
    if (version !== VERSION) {
      rmSync(path.join(versions, version), { force: true, recursive: true });
    }
  }
  const now = Date.now();
  for (const key of list(store)) {
    const dir = path.join(store, key);
    const dirTime = mtime(dir);
    if (key.startsWith('.') || dirTime === undefined) continue;
    const files = list(dir)
      .map((name) => {
        const file = path.join(dir, name);
        return { file, temp: name.startsWith('.'), time: mtime(file) };
      })
      .filter(({ time }) => time !== undefined)
      .sort((a, b) => b.time - a.time);
    let records = 0;
    let left = 0;
    for (const { file, temp, time } of files) {
      const stale = temp
        ? now - time > WRITE_GRACE
        : now - time > KEEP_DAYS * DAY || records >= KEEP_PER_KEY;
      if (stale) {
        rmSync(file, { force: true });
        continue;
      }
      left += 1;
      if (!temp) records += 1;
    }
    if (left === 0 && now - dirTime > WRITE_GRACE) {
      try {
        rmdirSync(dir);
      } catch (error) {
        if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error;
      }
    }
  }
};

/**
 * @param {string} root
 * @param {{ fresh?: boolean }} [options]
 */
export function openCache(root, { fresh = false } = {}) {
  const git = gitIn(root);
  let state;
  let marked;
  let filesMatchSnapshot = true;
  const running = new Map();
  const skipped = [];
  let store;
  let global;
  const mergeBases = new Map();
  let queue = [];
  let queued = 0;
  let dropped = null;
  const diffs = new Map();

  const current = () => {
    state ??= snapshot(root);
    return state;
  };
  const sameWork = () => snapshot(root).work === current().work;
  const stampFiles = () => {
    if (fresh || marked) return;
    current();
    marked = statAll(root);
    filesMatchSnapshot = sameWork();
  };
  const begin = (name) => {
    running.set(name, { filesMatchSnapshot, reason: null });
  };
  const settle = (name) => {
    const span = running.get(name);
    if (!marked) {
      running.delete(name);
      return `the cache was not watching the files while ${name} ran`;
    }
    const now = statAll(root);
    const written =
      [...now].find(([file, line]) => marked.get(file) !== line)?.[0] ??
      [...marked.keys()].find((file) => !now.has(file));
    marked = now;
    if (written !== undefined) {
      filesMatchSnapshot = sameWork();
      for (const [other, entry] of running) {
        entry.reason ??= `${written} was written while ${other} ran`;
      }
    }
    running.delete(name);
    if (span.reason) return span.reason;
    return span.filesMatchSnapshot
      ? null
      : `${name} ran on files that changed after the cache opened`;
  };
  const storeDir = () => {
    store ??= path.join(
      must(git, [
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
      ]).trim(),
      'kitcn-check',
      VERSION
    );
    return store;
  };
  const keyOf = (scope) => {
    global ??= globalPart(root, process.env);
    return sha256(
      JSON.stringify({
        command: scope.command,
        global,
        name: scope.name,
        v: VERSION,
      })
    ).slice(0, 32);
  };
  const diffTrees = (a, b) => {
    const pair = `${a} ${b}`;
    if (!diffs.has(pair)) {
      // diff-tree fails on a tree that gc pruned, so a pruned record gives no evidence.
      const result = git(['diff-tree', '-r', '-z', '--name-only', a, b]);
      diffs.set(pair, result.status === 0 ? entries(result.stdout) : null);
    }
    return diffs.get(pair);
  };
  const changedBetween = (from, to, filesOnly) => {
    const files = new Set();
    for (const side of filesOnly ? ['work'] : ['work', 'head']) {
      if (from[side] === to[side]) continue;
      const changed = diffTrees(from[side], to[side]);
      if (changed === null) return null;
      for (const file of changed) files.add(file);
    }
    if (!filesOnly) {
      const indexed = new Set(from.index).symmetricDifference(
        new Set(to.index)
      );
      for (const entry of indexed) files.add(entry.slice(1));
    }
    return [...files].sort(byCodeUnit);
  };
  const flush = () => {
    const notRecorded = () =>
      skipped.length === 0
        ? null
        : `${skipped.join('; ')}, so ${
            skipped.length === 1 ? 'that pass is' : 'those passes are'
          } not recorded`;
    if (dropped) return { dropped, written: 0 };
    if (queue.length === 0) return { dropped: notRecorded(), written: 0 };
    const passes = queue;
    queue = [];
    queued = 0;
    const id = stateId(current());
    if (stateId(snapshot(root)) !== id) {
      dropped =
        'the checkout changed while the checks ran, so this run records no passes';
      return { dropped, written: 0 };
    }
    for (const { at, key, record } of passes) {
      writeAtomically(
        path.join(storeDir(), key, at),
        `${JSON.stringify(record)}\n`
      );
    }
    sweep(storeDir());
    return { dropped: notRecorded(), written: passes.length };
  };

  return {
    /**
     * @param {Scope} scope
     * @param {{ mergeBase?: boolean, near?: boolean }} [options]
     * @returns {Base[]}
     */
    bases(scope, { mergeBase = false, near = false } = {}) {
      const found = [];
      if (!fresh && scope.cache !== false) {
        const dir = path.join(storeDir(), keyOf(scope));
        const exact = readRecord(
          path.join(dir, stateId(current(), scope.filesOnly))
        );
        if (exact) {
          return [
            {
              files: [],
              kind: 'exact',
              label: `passed at this tree (${exact.worktree}, ${ago(exact.at)})`,
            },
          ];
        }
        const newest = (near ? list(dir) : [])
          .filter((name) => !name.startsWith('.'))
          .map((name) => ({
            file: path.join(dir, name),
            time: mtime(path.join(dir, name)),
          }))
          .filter(({ time }) => time !== undefined)
          .sort((a, b) => b.time - a.time)
          .slice(0, NEAR);
        for (const { file } of newest) {
          const record = readRecord(file);
          const files =
            record && changedBetween(record.state, current(), scope.filesOnly);
          if (files) {
            found.push({
              files,
              kind: 'pass',
              label: `passed ${ago(record.at)} in ${record.worktree}`,
            });
          }
        }
      }
      if (mergeBase) {
        const filesOnly = Boolean(scope.filesOnly);
        if (!mergeBases.has(filesOnly)) {
          const files = changedBetween(
            mergeBaseState(root),
            current(),
            filesOnly
          );
          mergeBases.set(
            filesOnly,
            files && {
              files,
              kind: 'merge-base',
              label: 'passed at the merge base with origin/main',
            }
          );
        }
        if (mergeBases.get(filesOnly)) found.push(mergeBases.get(filesOnly));
      }
      return found;
    },
    stampFiles,
    /** @param {string} name */
    begin,
    /**
     * @param {Scope} scope
     * @param {{ passed: boolean, seconds: number }} result
     */
    end(scope, { passed, seconds }) {
      const reason = settle(scope.name);
      if (!passed || fresh || dropped || scope.cache === false) return;
      if (reason) {
        skipped.push(reason);
        return;
      }
      queue.push({
        at: stateId(current(), scope.filesOnly),
        key: keyOf(scope),
        record: {
          at: new Date().toISOString(),
          command: scope.command,
          name: scope.name,
          seconds,
          state: current(),
          v: VERSION,
          worktree: path.basename(root),
        },
      });
      queued += seconds;
      if (queued >= FLUSH_SECONDS) flush();
    },
    /** @returns {{ written: number, dropped: string | null }} */
    flush,
  };
}
