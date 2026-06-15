import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAutoChangesetContent,
  getAutoReleasePackages,
} from './prepare-release-changesets.mjs';

function createWorkspacePackages(entries) {
  const workspacePackages = new Map(
    Object.entries(entries).map(([packageName, runtimeDependencyNames]) => [
      packageName,
      {
        runtimeDependencyNames,
        runtimeDependentNames: [],
      },
    ])
  );

  for (const [packageName, workspacePackage] of workspacePackages) {
    for (const dependencyName of workspacePackage.runtimeDependencyNames) {
      workspacePackages
        .get(dependencyName)
        ?.runtimeDependentNames.push(packageName);
    }
  }

  return workspacePackages;
}

test('auto-releases transitive runtime dependents of released packages', () => {
  const workspacePackages = createWorkspacePackages({
    '@kitcn/core': [],
    '@kitcn/transitive': ['@kitcn/utils'],
    '@kitcn/utils': ['@kitcn/core'],
    kitcn: ['@kitcn/core', '@kitcn/utils'],
  });

  const autoReleasePackages = getAutoReleasePackages(
    [{ name: '@kitcn/core', type: 'patch' }],
    workspacePackages
  );

  assert.deepEqual(autoReleasePackages, [
    {
      name: '@kitcn/transitive',
      updatedDependencyNames: ['@kitcn/utils'],
    },
    {
      name: '@kitcn/utils',
      updatedDependencyNames: ['@kitcn/core'],
    },
    {
      name: 'kitcn',
      updatedDependencyNames: ['@kitcn/core', '@kitcn/utils'],
    },
  ]);
});

test('does not follow peer-only relationships', () => {
  const workspacePackages = createWorkspacePackages({
    '@kitcn/core': [],
    '@kitcn/utils': ['@kitcn/core'],
    '@kitcn/yjs': [],
    kitcn: ['@kitcn/core', '@kitcn/utils'],
  });

  const autoReleasePackages = getAutoReleasePackages(
    [{ name: '@kitcn/core', type: 'patch' }],
    workspacePackages
  );

  assert.deepEqual(autoReleasePackages, [
    {
      name: '@kitcn/utils',
      updatedDependencyNames: ['@kitcn/core'],
    },
    {
      name: 'kitcn',
      updatedDependencyNames: ['@kitcn/core', '@kitcn/utils'],
    },
  ]);
});

test('formats a synthetic changeset for one auto-bumped package', () => {
  const content = createAutoChangesetContent('kitcn', [
    '@kitcn/core',
    '@kitcn/utils',
  ]);

  assert.match(content, /"kitcn": patch/);
  assert.match(content, /Updated `@kitcn\/core`, `@kitcn\/utils`\./);
});
