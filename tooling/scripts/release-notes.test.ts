import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  addPackageChangelogLinks,
  extractReleaseChanges,
  generateRawReleaseNotes,
  getFullChangelog,
  getGlobalReleaseVersion,
  getPackageChangelogUrls,
  getWorkspacePackages,
  parsePublishedPackages,
  validateAiReleaseNotes,
} from './release-notes.mjs';

test('selects the highest published package version for the global release', () => {
  assert.equal(
    getGlobalReleaseVersion([
      { name: '@kitcn/list', version: '53.0.2' },
      { name: 'depset', version: '0.1.2' },
      { name: '@kitcn/table', version: '53.0.1' },
    ]),
    '53.0.2'
  );
});

test('parses changesets published package output safely', () => {
  assert.deepEqual(
    parsePublishedPackages('[{"name":"@kitcn/list","version":"53.0.2"}]'),
    [{ name: '@kitcn/list', version: '53.0.2' }]
  );
  assert.deepEqual(parsePublishedPackages('not json'), []);
});

test('extracts exact package changelog sections and preserves change types', () => {
  const changelog = `# @kitcn/table

## 54.0.0

### Major Changes

- Remove \`oldApi\`.

### Minor Changes

- Add \`newApi\`.

### Patch Changes

- Fix docs.

## 53.0.0

### Major Changes

- Older major.
`;

  assert.deepEqual(extractReleaseChanges(changelog, '54.0.0'), {
    body: '### Major Changes\n\n- Remove `oldApi`.\n\n### Minor Changes\n\n- Add `newApi`.\n\n### Patch Changes\n\n- Fix docs.',
    type: 'major',
  });
});

test('generates raw release notes from published package changelogs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kitcn-release-notes-'));
  const packageRoot = path.join(root, 'packages');
  const packageDirectory = path.join(packageRoot, 'list');

  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    path.join(packageDirectory, 'package.json'),
    JSON.stringify({ name: '@kitcn/list', version: '53.0.2' })
  );
  await writeFile(
    path.join(packageDirectory, 'CHANGELOG.md'),
    `# @kitcn/list

## 53.0.2

### Patch Changes

- [#4954](https://github.com/udecode/kitcn/pull/4954) by [@dylans](https://github.com/dylans) – Fix ordered list numbering.
`
  );

  const body = await generateRawReleaseNotes({
    fullChangelog: {
      label: 'v53.0.1...v53.0.2',
      url: 'https://github.com/udecode/kitcn/compare/v53.0.1...v53.0.2',
    },
    publishedPackages: [{ name: '@kitcn/list', version: '53.0.2' }],
    workspacePackages: await getWorkspacePackages([packageRoot]),
  });

  assert.match(body, /## `@kitcn\/list`/);
  assert.match(body, /### Patch Changes/);
  assert.match(body, /Fix ordered list numbering/);
  assert.match(body, /## Contributors/);
  assert.match(body, /@dylans/);
  assert.match(
    body,
    /Full changelog: \[`v53\.0\.1\.\.\.v53\.0\.2`\]\(https:\/\/github\.com\/udecode\/kitcn\/compare\/v53\.0\.1\.\.\.v53\.0\.2\)/
  );
  assert.doesNotMatch(body, /For detailed changes/);
});

test('builds changelog URLs for every published workspace package', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kitcn-detailed-changes-'));
  const packageRoot = path.join(root, 'packages');
  const listDirectory = path.join(packageRoot, 'list');
  const kitcnDirectory = path.join(packageRoot, 'kitcn');

  await mkdir(listDirectory, { recursive: true });
  await mkdir(kitcnDirectory, { recursive: true });
  await writeFile(
    path.join(listDirectory, 'package.json'),
    JSON.stringify({ name: '@kitcn/list', version: '53.0.5' })
  );
  await writeFile(
    path.join(kitcnDirectory, 'package.json'),
    JSON.stringify({ name: 'kitcn', version: '53.0.5' })
  );

  assert.deepEqual(
    getPackageChangelogUrls({
      commitRef: 'abc123',
      publishedPackages: [
        { name: '@kitcn/list', version: '53.0.5' },
        { name: 'kitcn', version: '53.0.5' },
      ],
      repoRootDirectory: root,
      workspacePackages: await getWorkspacePackages([packageRoot]),
    }),
    new Map([
      [
        '@kitcn/list',
        'https://github.com/udecode/kitcn/blob/abc123/packages/list/CHANGELOG.md',
      ],
      [
        'kitcn',
        'https://github.com/udecode/kitcn/blob/abc123/packages/kitcn/CHANGELOG.md',
      ],
    ])
  );
});

test('adds package changelog links only during AI finalization', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kitcn-package-links-'));
  const packageRoot = path.join(root, 'packages');
  const listDirectory = path.join(packageRoot, 'list');
  const kitcnDirectory = path.join(packageRoot, 'kitcn');

  await mkdir(listDirectory, { recursive: true });
  await mkdir(kitcnDirectory, { recursive: true });
  await writeFile(
    path.join(listDirectory, 'package.json'),
    JSON.stringify({ name: '@kitcn/list', version: '53.0.5' })
  );
  await writeFile(
    path.join(kitcnDirectory, 'package.json'),
    JSON.stringify({ name: 'kitcn', version: '53.0.5' })
  );

  const content = `## \`@kitcn/list\`

### Patch Changes

- Fix lists.

## \`kitcn\`

### Patch Changes

- Update wrapper.

## Contributors

Thanks to everyone who contributed to this release:

@alice

Full changelog: [\`v53.0.4...v53.0.5\`](https://github.com/udecode/kitcn/compare/v53.0.4...v53.0.5)
`;

  const linkedContent = addPackageChangelogLinks(content, {
    commitRef: 'abc123',
    publishedPackages: [
      { name: '@kitcn/list', version: '53.0.5' },
      { name: 'kitcn', version: '53.0.5' },
    ],
    repoRootDirectory: root,
    workspacePackages: await getWorkspacePackages([packageRoot]),
  });

  assert.match(
    linkedContent,
    /## `@kitcn\/list`[\s\S]*For detailed changes, see \[`CHANGELOG`\]\(https:\/\/github\.com\/udecode\/kitcn\/blob\/abc123\/packages\/list\/CHANGELOG\.md\)[\s\S]*## `kitcn`/
  );
  assert.match(
    linkedContent,
    /## `kitcn`[\s\S]*For detailed changes, see \[`CHANGELOG`\]\(https:\/\/github\.com\/udecode\/kitcn\/blob\/abc123\/packages\/kitcn\/CHANGELOG\.md\)[\s\S]*## Contributors/
  );
});

test('uses release index package tags for full changelog fallback', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kitcn-release-index-'));
  const releaseIndexFile = path.join(root, 'release-index.json');

  await writeFile(
    releaseIndexFile,
    JSON.stringify([
      {
        packageTag: '@kitcn/ai@98.0.0',
        tag: 'v98.0.0',
      },
    ])
  );

  assert.deepEqual(
    await getFullChangelog({
      globalReleaseTags: ['v1.0.0'],
      publishedPackages: [{ name: 'kitcn', version: '99.0.0' }],
      releaseIndexFile,
      version: '99.0.0',
    }),
    {
      label: 'v98.0.0...v99.0.0',
      url: 'https://github.com/udecode/kitcn/compare/%40kitcn%2Fai%4098.0.0...kitcn%4099.0.0',
    }
  );
});

test('uses previous global tag when it matches the release index version', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kitcn-release-index-'));
  const releaseIndexFile = path.join(root, 'release-index.json');

  await writeFile(
    releaseIndexFile,
    JSON.stringify([
      {
        packageTag: 'kitcn@99.0.0',
        tag: 'v99.0.0',
      },
    ])
  );

  assert.deepEqual(
    await getFullChangelog({
      globalReleaseTags: ['v99.0.0'],
      publishedPackages: [{ name: 'kitcn', version: '99.0.1' }],
      releaseIndexFile,
      version: '99.0.1',
    }),
    {
      label: 'v99.0.0...v99.0.1',
      url: 'https://github.com/udecode/kitcn/compare/v99.0.0...v99.0.1',
    }
  );
});

test('validates AI release notes preserve deterministic structure', () => {
  const raw = `## \`@kitcn/table\`

### Major Changes

- Removed \`oldApi\` ([#5000](https://github.com/udecode/kitcn/pull/5000))
> **Migration:** Use \`newApi\`.

For detailed changes, see [\`CHANGELOG\`](https://github.com/udecode/kitcn/blob/abc/packages/table/CHANGELOG.md)

## Contributors

Thanks to everyone who contributed to this release:

@alice
`;
  const good = raw.replace('Removed `oldApi`', 'Removed `oldApi` from tables');
  const bad = raw
    .replace('## `@kitcn/table`', '## `@kitcn/core`')
    .replace('[#5000](https://github.com/udecode/kitcn/pull/5000)', '')
    .replace('> **Migration:** Use `newApi`.\n', '')
    .replace(
      '\n## Contributors\n\nThanks to everyone who contributed to this release:\n\n@alice\n',
      ''
    );

  assert.deepEqual(validateAiReleaseNotes(raw, good), {
    errors: [],
    valid: true,
  });
  assert.equal(validateAiReleaseNotes(raw, bad).valid, false);
  assert.match(
    validateAiReleaseNotes(raw, bad).errors.join('\n'),
    /AI output dropped Contributors section\./
  );
});

test('validates AI release notes preserve the Contributors section itself', () => {
  const raw = `## \`@kitcn/table\`

### Patch Changes

- [#5000](https://github.com/udecode/kitcn/pull/5000) by [@alice](https://github.com/alice) – Fix table.

For detailed changes, see [\`CHANGELOG\`](https://github.com/udecode/kitcn/blob/abc/packages/table/CHANGELOG.md)

## Contributors

Thanks to everyone who contributed to this release:

@alice
`;
  const withoutContributors = raw.replace(
    '\n## Contributors\n\nThanks to everyone who contributed to this release:\n\n@alice\n',
    '\n'
  );

  assert.deepEqual(validateAiReleaseNotes(raw, withoutContributors), {
    errors: ['AI output dropped Contributors section.'],
    valid: false,
  });
});

test('validates AI release notes preserve comma-separated contributor handles', () => {
  const raw = `## \`@kitcn/table\`

### Patch Changes

- [#5000](https://github.com/udecode/kitcn/pull/5000) by [@alice](https://github.com/alice) – Fix table.
- [#5001](https://github.com/udecode/kitcn/pull/5001) by [@bob](https://github.com/bob) – Fix more.

For detailed changes, see [\`CHANGELOG\`](https://github.com/udecode/kitcn/blob/abc/packages/table/CHANGELOG.md)

## Contributors

Thanks to everyone who contributed to this release:

@alice, @bob
`;
  const missingBob = raw.replace('@alice, @bob', '@alice');

  assert.deepEqual(validateAiReleaseNotes(raw, missingBob), {
    errors: ['AI output dropped contributors.'],
    valid: false,
  });
});

test('validates AI release notes preserve exact PR links', () => {
  const raw = `## \`@kitcn/table\`

### Patch Changes

- Fix table ([#5000](https://github.com/udecode/kitcn/pull/5000))

For detailed changes, see [\`CHANGELOG\`](https://github.com/udecode/kitcn/blob/abc/packages/table/CHANGELOG.md)
`;
  const wrongPullRequest = raw.replace(
    '[#5000](https://github.com/udecode/kitcn/pull/5000)',
    '[#5999](https://github.com/udecode/kitcn/pull/5999)'
  );

  assert.deepEqual(validateAiReleaseNotes(raw, wrongPullRequest), {
    errors: ['AI output changed PR links.'],
    valid: false,
  });
});

test('validates AI release notes preserve exact commit links', () => {
  const raw = `## \`@kitcn/resend\`

### Patch Changes

- Updated \`svix\`. ([\`ce9ec87\`](https://github.com/udecode/kitcn/commit/ce9ec871c9547a8a3c78ded13a93049ef9fe049c))

For detailed changes, see [\`CHANGELOG\`](https://github.com/udecode/kitcn/blob/abc/packages/resend/CHANGELOG.md)
`;
  const withoutCommit = raw.replace(
    '([`ce9ec87`](https://github.com/udecode/kitcn/commit/ce9ec871c9547a8a3c78ded13a93049ef9fe049c))',
    ''
  );

  assert.deepEqual(validateAiReleaseNotes(raw, withoutCommit), {
    errors: ['AI output changed commit links.'],
    valid: false,
  });
});

test('validates AI release notes reject added release entries', () => {
  const raw = `## \`@kitcn/table\`

### Patch Changes

- Fix table ([#5000](https://github.com/udecode/kitcn/pull/5000))

For detailed changes, see [\`CHANGELOG\`](https://github.com/udecode/kitcn/blob/abc/packages/table/CHANGELOG.md)
`;
  const withAddedEntry = raw.replace(
    'For detailed changes',
    '- Invent unrelated change\n\nFor detailed changes'
  );

  assert.deepEqual(validateAiReleaseNotes(raw, withAddedEntry), {
    errors: ['AI output changed release entry count.'],
    valid: false,
  });
});
