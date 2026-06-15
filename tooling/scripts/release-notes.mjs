#!/usr/bin/env node

import { appendFile, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const repo = 'udecode/kitcn';
const packageRoots = [path.join(repoRoot, 'packages')];
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const releaseTypeHeadingPattern =
  /^###\s+(Major|Minor|Patch) Changes[^\S\r\n]*$/gm;
const nextVersionHeadingPattern = /^##\s+/m;
const packageHeadingPattern = /^## `[^`]+`[^\S\r\n]*$/gm;
const packageNameFromHeadingPattern = /^## `([^`]+)`/;
const changeHeadingPattern = /^###\s+(Major|Minor|Patch) Changes[^\S\r\n]*$/gm;
const changelogLinkPattern =
  /For detailed changes, see \[`CHANGELOG`\]\([^)]+\)/g;
const fullChangelogFooterPattern =
  /\n\nFull changelog: \[`[^`]+`\]\([^)]+\)\s*$/;
const contributorsFooterPattern = /\n## Contributors\b[\s\S]*$/;
const releaseFooterPattern =
  /(?:^|\n)(?:## Contributors\b|Full changelog: \[`[^`]+`\]\([^)]+\))/;
const markdownHeadingBoundaryPattern = /\n##\s+/;
const packageChangelogFooterPattern =
  /\n*For detailed changes, see \[`CHANGELOG`\]\([^)]+\)\s*$/g;
const pullRequestLinkPattern = /\[#\d+\]\(https:\/\/github\.com\/[^)]+\)/g;
const commitLinkPattern =
  /\[`[0-9a-f]{7,40}`\]\(https:\/\/github\.com\/udecode\/kitcn\/commit\/[0-9a-f]{7,40}\)/g;
const bulletEntryPattern = /^-\s+/gm;
const migrationPattern = /\bMigration\b/g;
const contributorPattern =
  /by \[@([A-Za-z0-9-]+)\]\(https:\/\/github\.com\/[^)]+\)/g;
const releaseTypes = ['major', 'minor', 'patch'];
const releaseTypeLabels = {
  major: 'Major',
  minor: 'Minor',
  patch: 'Patch',
};
const writeStderr = (message) => process.stderr.write(`${String(message)}\n`);
const writeStdout = (message) => process.stdout.write(`${String(message)}\n`);

if (isMainModule()) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    writeStderr(error?.message ?? error);
    process.exit(1);
  }
}

function isMainModule() {
  const entrypoint = process.argv[1];

  return (
    !!entrypoint && path.resolve(entrypoint) === fileURLToPath(import.meta.url)
  );
}

async function main(args) {
  if (args[0] === 'validate') {
    const [, rawPath, finalPath] = args;

    if (!rawPath || !finalPath) {
      throw new Error('Usage: release-notes.mjs validate <raw> <final>');
    }

    const result = await validateAiReleaseNotesFiles(rawPath, finalPath);

    if (!result.valid) {
      for (const error of result.errors) {
        writeStderr(`::warning::${error}`);
      }

      await rm(finalPath, { force: true });
      return;
    }

    writeStdout('AI release notes passed validation.');
    return;
  }

  if (args[0] === 'add-package-changelogs') {
    const [, releaseNotesPath] = args;

    if (!releaseNotesPath) {
      throw new Error(
        'Usage: release-notes.mjs add-package-changelogs <release-notes>'
      );
    }

    const publishedPackages = parsePublishedPackages(
      process.env.PUBLISHED_PACKAGES ??
        process.env.PUBLISHED_PACKAGES_JSON ??
        ''
    );
    const workspacePackages = await getWorkspacePackages();
    const content = await readFile(releaseNotesPath, 'utf8');
    const updatedContent = addPackageChangelogLinks(content, {
      commitRef: process.env.GITHUB_SHA || 'main',
      publishedPackages,
      workspacePackages,
    });

    await writeFile(releaseNotesPath, updatedContent);

    writeStdout(`Added package changelog links to ${releaseNotesPath}.`);
    return;
  }

  const publishedPackages = parsePublishedPackages(
    process.env.PUBLISHED_PACKAGES ?? process.env.PUBLISHED_PACKAGES_JSON ?? ''
  );
  const version = getGlobalReleaseVersion(publishedPackages);

  if (!version) {
    throw new Error('No published package version found.');
  }

  const workspacePackages = await getWorkspacePackages();
  const body = await generateRawReleaseNotes({
    publishedPackages,
    workspacePackages,
  });
  const rawFile = path.join(repoRoot, `.release-notes-raw-${version}.md`);

  await writeFile(rawFile, body);
  await setOutput('version', version);
  await setOutput('raw_changelog_path', rawFile);

  writeStdout(`Wrote raw release notes to ${rawFile}`);
}

export function parsePublishedPackages(publishedPackagesJson) {
  try {
    const publishedPackages = JSON.parse(publishedPackagesJson || '[]');

    return Array.isArray(publishedPackages) ? publishedPackages : [];
  } catch {
    return [];
  }
}

export function getGlobalReleaseVersion(publishedPackages) {
  return publishedPackages
    .map((publishedPackage) => publishedPackage?.version)
    .filter((version) => typeof version === 'string')
    .filter((version) => semverPattern.test(version))
    .sort(compareVersionsDesc)[0];
}

export function getPackageChangelogUrls({
  commitRef = 'main',
  publishedPackages,
  repoRootDirectory = repoRoot,
  workspacePackages,
}) {
  const changelogUrls = new Map();

  for (const publishedPackage of publishedPackages) {
    if (typeof publishedPackage?.name !== 'string') continue;

    const workspacePackage = workspacePackages.get(publishedPackage.name);

    if (!workspacePackage?.directory) continue;

    const packageDirectory = normalizePath(
      path.relative(repoRootDirectory, workspacePackage.directory)
    );

    if (!packageDirectory || packageDirectory.startsWith('..')) continue;

    changelogUrls.set(
      publishedPackage.name,
      `https://github.com/${repo}/blob/${commitRef}/${packageDirectory}/CHANGELOG.md`
    );
  }

  return changelogUrls;
}

export async function getWorkspacePackages(roots = packageRoots) {
  const workspacePackages = new Map();

  for (const root of roots) {
    let entries;

    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const directory = path.join(root, entry.name);
      const packageJson = await readPackageJson(directory);

      if (packageJson?.name) {
        workspacePackages.set(packageJson.name, {
          directory,
          packageJson,
        });
      }
    }
  }

  return workspacePackages;
}

export async function generateRawReleaseNotes({
  publishedPackages,
  workspacePackages,
}) {
  const lines = [];
  const packages = publishedPackages
    .filter(
      (publishedPackage) =>
        typeof publishedPackage?.name === 'string' &&
        typeof publishedPackage?.version === 'string'
    )
    .sort(
      (a, b) =>
        compareVersionsDesc(a.version, b.version) ||
        a.name.localeCompare(b.name)
    );

  for (const publishedPackage of packages) {
    const workspacePackage = workspacePackages.get(publishedPackage.name);
    const changelog = workspacePackage
      ? await readOptionalFile(
          path.join(workspacePackage.directory, 'CHANGELOG.md')
        )
      : null;
    const releaseChanges = changelog
      ? extractReleaseChanges(changelog, publishedPackage.version)
      : null;

    lines.push(`## \`${publishedPackage.name}\``);
    lines.push('');

    if (releaseChanges) {
      lines.push(releaseChanges.body);
    } else {
      lines.push(
        `Published \`${publishedPackage.name}@${publishedPackage.version}\`.`
      );
    }

    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function addPackageChangelogLinks(
  content,
  {
    commitRef = 'main',
    publishedPackages,
    repoRootDirectory,
    workspacePackages,
  }
) {
  const contentWithoutReleaseFooter = stripReleaseFooter(content);
  const changelogUrls = getPackageChangelogUrls({
    commitRef,
    publishedPackages,
    repoRootDirectory,
    workspacePackages,
  });
  let output = '';
  let cursor = 0;

  for (const match of contentWithoutReleaseFooter.matchAll(
    packageHeadingPattern
  )) {
    const headingStart = match.index;

    if (headingStart < cursor) continue;

    const heading = match[0];
    const packageName = packageNameFromHeadingPattern.exec(heading)?.[1];
    const bodyStart = headingStart + heading.length;
    const nextHeadingMatch = markdownHeadingBoundaryPattern.exec(
      contentWithoutReleaseFooter.slice(bodyStart)
    );
    const sectionEnd =
      nextHeadingMatch?.index === undefined
        ? contentWithoutReleaseFooter.length
        : bodyStart + nextHeadingMatch.index;
    const changelogUrl = packageName ? changelogUrls.get(packageName) : null;
    let sectionBody = contentWithoutReleaseFooter.slice(bodyStart, sectionEnd);

    output += contentWithoutReleaseFooter.slice(cursor, bodyStart);

    if (changelogUrl) {
      sectionBody = appendPackageChangelogLink(sectionBody, changelogUrl);
    }

    output += sectionBody;
    cursor = sectionEnd;
  }

  output += contentWithoutReleaseFooter.slice(cursor);

  return output.endsWith('\n') ? output : `${output}\n`;
}

export function extractReleaseChanges(changelog, version) {
  const versionSection = extractVersionSection(changelog, version);

  if (!versionSection) return null;

  const sections = extractReleaseTypeSections(versionSection);

  if (sections.length === 0) return null;

  return {
    body: sections
      .map(
        (section) =>
          `### ${releaseTypeLabels[section.type]} Changes\n\n${section.body}`
      )
      .join('\n\n'),
    type: sections[0].type,
  };
}

export function validateAiReleaseNotes(raw, final) {
  const errors = [];
  const rawPackageHeadings = matchAll(raw, packageHeadingPattern);
  const finalPackageHeadings = matchAll(final, packageHeadingPattern);
  const rawChangeHeadings = matchAll(raw, changeHeadingPattern);
  const finalChangeHeadings = matchAll(final, changeHeadingPattern);
  const rawChangelogLinks = matchAll(raw, changelogLinkPattern);
  const finalChangelogLinks = matchAll(final, changelogLinkPattern);
  const rawPullRequestLinks = matchAll(raw, pullRequestLinkPattern);
  const finalPullRequestLinks = matchAll(final, pullRequestLinkPattern);
  const rawCommitLinks = matchAll(raw, commitLinkPattern);
  const finalCommitLinks = matchAll(final, commitLinkPattern);
  const missingContributors = extractContributorHandles(raw).filter(
    (handle) => !hasContributorHandle(final, handle)
  );

  if (final.trim().length === 0) {
    errors.push('AI output is empty.');
  }

  if (!sameList(rawPackageHeadings, finalPackageHeadings)) {
    errors.push('AI output changed package headings.');
  }

  if (!sameList(rawChangeHeadings, finalChangeHeadings)) {
    errors.push('AI output changed change-type headings.');
  }

  if (!sameList(rawChangelogLinks, finalChangelogLinks)) {
    errors.push('AI output changed package changelog links.');
  }

  if (!sameList(rawPullRequestLinks, finalPullRequestLinks)) {
    errors.push('AI output changed PR links.');
  }

  if (!sameList(rawCommitLinks, finalCommitLinks)) {
    errors.push('AI output changed commit links.');
  }

  if (
    countMatches(final, bulletEntryPattern) !==
    countMatches(raw, bulletEntryPattern)
  ) {
    errors.push('AI output changed release entry count.');
  }

  if (
    countMatches(final, migrationPattern) < countMatches(raw, migrationPattern)
  ) {
    errors.push('AI output dropped migration notes.');
  }

  if (releaseFooterPattern.test(final)) {
    errors.push('AI output added release footer.');
  }

  if (missingContributors.length > 0) {
    errors.push('AI output dropped contributors.');
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}

async function validateAiReleaseNotesFiles(rawPath, finalPath) {
  const [raw, final] = await Promise.all([
    readFile(rawPath, 'utf8'),
    readFile(finalPath, 'utf8'),
  ]);

  return validateAiReleaseNotes(raw, final);
}

function extractVersionSection(changelog, version) {
  const versionHeadingPattern = new RegExp(
    `^##\\s+${escapeRegExp(version)}(?:\\s|$).*`,
    'm'
  );
  const match = versionHeadingPattern.exec(changelog);

  if (!match) return null;

  const bodyStart = match.index + match[0].length;
  const rest = changelog.slice(bodyStart);
  const nextMatch = rest.match(nextVersionHeadingPattern);
  const bodyEnd =
    nextMatch?.index === undefined
      ? changelog.length
      : bodyStart + nextMatch.index;

  return changelog.slice(bodyStart, bodyEnd);
}

function extractReleaseTypeSections(content) {
  const matches = [...content.matchAll(releaseTypeHeadingPattern)];

  return matches
    .map((match, index) => {
      const bodyStart = match.index + match[0].length;
      const nextMatch = matches[index + 1];
      const bodyEnd = nextMatch?.index ?? content.length;
      const body = content.slice(bodyStart, bodyEnd).trim();

      if (!body) return null;

      return {
        body,
        type: match[1].toLowerCase(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => compareReleaseTypes(a.type, b.type));
}

function appendPackageChangelogLink(sectionBody, changelogUrl) {
  return `${sectionBody
    .replace(packageChangelogFooterPattern, '')
    .trimEnd()}\n\nFor detailed changes, see [\`CHANGELOG\`](${changelogUrl})`;
}

function stripReleaseFooter(content) {
  return content
    .replace(contributorsFooterPattern, '')
    .replace(fullChangelogFooterPattern, '')
    .trimEnd();
}

async function readPackageJson(directory) {
  const content = await readOptionalFile(path.join(directory, 'package.json'));

  return content ? JSON.parse(content) : null;
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

async function readOptionalFile(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function collectContributors(contributors, content) {
  for (const match of content.matchAll(contributorPattern)) {
    contributors.add(match[1]);
  }
}

function extractContributorHandles(content) {
  const contributors = new Set();

  collectContributors(contributors, content);

  return [...contributors];
}

function hasContributorHandle(content, handle) {
  const escapedHandle = escapeRegExp(handle);

  return new RegExp(
    `(?:^|[^A-Za-z0-9_/-])@${escapedHandle}\\b|github\\.com/${escapedHandle}\\b`,
    'm'
  ).test(content);
}

function compareVersionsDesc(a, b) {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  for (let index = 0; index < 3; index++) {
    const delta = parsedB.parts[index] - parsedA.parts[index];

    if (delta !== 0) return delta;
  }

  if (parsedA.prerelease && !parsedB.prerelease) return 1;
  if (!parsedA.prerelease && parsedB.prerelease) return -1;

  return parsedB.prerelease.localeCompare(parsedA.prerelease);
}

function parseVersion(version) {
  const [core, prerelease = ''] = version.split('-');

  return {
    parts: core.split('.').map(Number),
    prerelease,
  };
}

function compareReleaseTypes(a, b) {
  return releaseTypes.indexOf(a) - releaseTypes.indexOf(b);
}

function matchAll(content, pattern) {
  return [...content.matchAll(pattern)].map((match) => match[0]);
}

function countMatches(content, pattern) {
  return matchAll(content, pattern).length;
}

function sameList(left, right) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;

  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
