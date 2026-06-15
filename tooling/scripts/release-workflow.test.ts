import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const releaseWorkflowPath = new URL(
  '../../.github/workflows/release.yml',
  import.meta.url
);
const autoReleaseWorkflowPath = new URL(
  '../../.github/workflows/changeset-auto-release.yml',
  import.meta.url
);
const packageJsonPath = new URL('../../package.json', import.meta.url);

test('release workflow uses the copied GitHub Release path', async () => {
  const workflow = await readFile(releaseWorkflowPath, 'utf8');

  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /github\.repository == 'udecode\/kitcn'/);
  assert.match(
    workflow,
    /!contains\(github\.event\.head_commit\.message, '\[skip release\]'\)/
  );
  assert.match(workflow, /actions\/create-github-app-token/);
  assert.match(workflow, /tooling\/scripts\/auto-release-pr\.mjs/);
  assert.match(workflow, /tooling\/scripts\/prepare-release-changesets\.mjs/);
  assert.match(workflow, /createGithubReleases:\s*false/);
  assert.match(workflow, /version:\s*bun run ci:version/);
  assert.match(workflow, /publish:\s*bun run ci:release/);
  assert.match(workflow, /node tooling\/scripts\/published-package-tags\.mjs/);
  assert.match(workflow, /refs\/tags\/\$\{tag\}:refs\/tags\/\$\{tag\}/);
  assert.match(workflow, /node tooling\/scripts\/release-notes\.mjs/);
  assert.match(workflow, /anthropics\/claude-code-action\/base-action/);
  assert.match(
    workflow,
    /node tooling\/scripts\/release-notes\.mjs add-package-changelogs "\$\{RAW_PATH\}\.final"/
  );
  assert.match(workflow, /touch "\$\{RAW_PATH\}\.final\.validated"/);
  assert.match(
    workflow,
    /-f "\$\{RAW_PATH\}\.final" && -f "\$\{RAW_PATH\}\.final\.validated"/
  );
  assert.match(workflow, /Ignoring unvalidated AI-rewritten release notes/);
  assert.match(workflow, /gh release (create|edit)/);
  assert.match(
    workflow,
    /gh pr merge "\$RELEASE_PR" --squash --delete-branch --admin/
  );
  assert.doesNotMatch(workflow, /sync-version-package-releases/);
  assert.doesNotMatch(workflow, /sync-release-artifacts/);
  assert.doesNotMatch(workflow, /templates\/release-sync-failure/);
  assert.doesNotMatch(workflow, /branches:\s*[\s\S]*-\s*next/);
});

test('auto-release checkbox workflow imports the canonical helper', async () => {
  const workflow = await readFile(autoReleaseWorkflowPath, 'utf8');

  assert.match(workflow, /github\.repository == 'udecode\/kitcn'/);
  assert.match(workflow, /tooling\/scripts\/auto-release-pr\.mjs/);
});

test('package scripts expose CI version and release commands only', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  assert.equal(
    packageJson.scripts['ci:version'],
    'bun changeset version && bun install --no-frozen-lockfile'
  );
  assert.equal(packageJson.scripts['ci:release'], 'bun run release');
  assert.equal(packageJson.scripts['release:releases'], undefined);
});
