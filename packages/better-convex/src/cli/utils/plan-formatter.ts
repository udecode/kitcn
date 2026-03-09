import { diffWords, structuredPatch } from 'diff';
import type {
  PlanFileAction,
  PluginInstallPlan,
  PluginInstallPlanFile,
  PluginInstallPlanOperation,
} from '../types.js';
import { highlighter } from './highlighter.js';

const MAX_OVERVIEW_FILES = 5;
const BOX_INNER_WIDTH = 46;
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const TRAILING_COMMA_RE = /,$/;
const LEADING_WHITESPACE_RE = /^(\s*)/;
const SINGLE_OR_DOUBLE_QUOTE_RE = /['"]/g;
const TRAILING_SEMICOLON_RE = /;$/g;

type HunkEntry = {
  kind: 'context' | 'removed' | 'added';
  formatted: string;
};

const normalizePath = (value: string): string => value.replaceAll('\\', '/');
const visibleLength = (value: string): number =>
  value.replace(ANSI_RE, '').length;

const padEnd = (value: string, width: number): string => {
  const missing = Math.max(0, width - visibleLength(value));
  return `${value}${' '.repeat(missing)}`;
};

const actionGlyph = (action: PlanFileAction): string => {
  if (action === 'create') {
    return highlighter.success('+');
  }
  if (action === 'update') {
    return highlighter.warn('~');
  }
  return highlighter.dim('=');
};

const actionLabel = (action: PlanFileAction): string => {
  if (action === 'create') {
    return highlighter.success('create');
  }
  if (action === 'update') {
    return highlighter.warn('update');
  }
  return highlighter.dim('skip');
};

const dimLine = (value: string): string => highlighter.dim(value);
const boldLine = (value: string): string => highlighter.bold(value);

const renderHeader = (title: string, subtitle?: string): string =>
  `${boldLine('┌')} ${boldLine(title)}${subtitle ? ` ${dimLine(subtitle)}` : ''}`;

const renderSectionTitle = (title: string, meta?: string): string =>
  `${dimLine('├')} ${boldLine(title)}${meta ? ` ${dimLine(meta)}` : ''}`;

const renderBoxLine = (value: string): string =>
  `${dimLine('│')} ${dimLine('│')} ${value}`;

const renderContentBox = (
  contentLines: string[],
  formatLine: (value: string) => string = (value) => value
): string[] => {
  const top = dimLine(`┌${'─'.repeat(BOX_INNER_WIDTH)}`);
  const bottom = dimLine(`└${'─'.repeat(BOX_INNER_WIDTH)}`);
  return [
    `${dimLine('│')} ${top}`,
    ...contentLines.map((line) => renderBoxLine(formatLine(line))),
    `${dimLine('│')} ${bottom}`,
  ];
};

const renderOperationTarget = (
  operation: PluginInstallPlanOperation
): string | undefined =>
  operation.path ?? operation.packageName ?? operation.command ?? operation.key;

const renderSummaryFileLine = (file: PluginInstallPlanFile): string =>
  `${dimLine('│')} ${actionGlyph(file.action)} ${padEnd(
    highlighter.path(file.path),
    44
  )} ${dimLine(`[${file.kind}]`)} ${actionLabel(file.action)}`;

const renderSummaryOperationLine = (
  operation: PluginInstallPlanOperation
): string => {
  const target = renderOperationTarget(operation);
  return `${dimLine('│')} ${dimLine('•')} ${padEnd(operation.kind, 18)} ${dimLine(
    operation.status
  )}${target ? ` ${dimLine(target)}` : ''}`;
};

const normalizeLine = (line: string): string =>
  line
    .replace(/\s+/g, ' ')
    .trim()
    .replace(SINGLE_OR_DOUBLE_QUOTE_RE, "'")
    .replaceAll(';', '')
    .replace(TRAILING_COMMA_RE, '');

const normalizeFileForDiff = (value: string): string =>
  value
    .split('\n')
    .map((line) => {
      const indent = line.match(LEADING_WHITESPACE_RE)?.[1] ?? '';
      const content = line.slice(indent.length);
      return (
        indent +
        content
          .replace(SINGLE_OR_DOUBLE_QUOTE_RE, '"')
          .replace(TRAILING_SEMICOLON_RE, '')
      );
    })
    .join('\n');

const isFormattingOnly = (oldValue: string, newValue: string): boolean => {
  const normalize = (value: string): string =>
    value
      .split('\n')
      .map(normalizeLine)
      .filter((line) => line.length > 0)
      .join(' ');

  return normalize(oldValue) === normalize(newValue);
};

const isGroupFormattingOnly = (
  removed: readonly string[],
  added: readonly string[]
): boolean => {
  const normalize = (lines: readonly string[]): string =>
    lines
      .map(normalizeLine)
      .filter((line) => line.length > 0)
      .join(' ');

  return normalize(removed) === normalize(added);
};

const collapseContinuationLines = (lines: readonly string[]): string[] => {
  const result: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];

    while (index + 1 < lines.length && line.trimEnd().endsWith(':')) {
      index += 1;
      line = `${line.trimEnd()} ${lines[index].trim()}`;
    }

    result.push(line);
  }

  return result;
};

const highlightInlineChanges = (
  oldLine: string,
  newLine: string
): {
  oldHighlighted: string;
  newHighlighted: string;
} => {
  const changes = diffWords(oldLine, newLine);
  let oldHighlighted = '-';
  let newHighlighted = '+';

  for (const change of changes) {
    if (change.added) {
      newHighlighted += highlighter.bold(highlighter.success(change.value));
      continue;
    }
    if (change.removed) {
      oldHighlighted += highlighter.bold(highlighter.error(change.value));
      continue;
    }

    oldHighlighted += highlighter.error(change.value);
    newHighlighted += highlighter.success(change.value);
  }

  return { oldHighlighted, newHighlighted };
};

const processChangeGroup = (
  removed: readonly string[],
  added: readonly string[],
  newLines: readonly string[],
  newLineIndex: number,
  entries: HunkEntry[]
): number => {
  let nextLineIndex = newLineIndex;

  if (isGroupFormattingOnly(removed, added)) {
    for (const line of added) {
      const actual = newLines[nextLineIndex] ?? line;
      entries.push({ kind: 'context', formatted: dimLine(` ${actual}`) });
      nextLineIndex += 1;
    }
    return nextLineIndex;
  }

  const collapsedRemoved = collapseContinuationLines(removed);
  const normalizedCollapsed = collapsedRemoved.map(normalizeLine);
  const usedCollapsed = new Set<number>();

  for (const line of added) {
    const actualNewLine = newLines[nextLineIndex] ?? line;
    const normalizedAdded = normalizeLine(line);
    const matchIndex = normalizedCollapsed.findIndex(
      (normalized, collapsedIndex) =>
        !usedCollapsed.has(collapsedIndex) && normalized === normalizedAdded
    );

    if (matchIndex !== -1) {
      usedCollapsed.add(matchIndex);
      entries.push({
        kind: 'context',
        formatted: dimLine(` ${actualNewLine}`),
      });
      nextLineIndex += 1;
      continue;
    }

    const unmatchedIndex = normalizedCollapsed.findIndex(
      (_, collapsedIndex) => !usedCollapsed.has(collapsedIndex)
    );

    if (unmatchedIndex !== -1) {
      usedCollapsed.add(unmatchedIndex);
      const { oldHighlighted, newHighlighted } = highlightInlineChanges(
        collapsedRemoved[unmatchedIndex],
        actualNewLine
      );
      entries.push({ kind: 'removed', formatted: oldHighlighted });
      entries.push({ kind: 'added', formatted: newHighlighted });
    } else {
      entries.push({
        kind: 'added',
        formatted: highlighter.success(`+${actualNewLine}`),
      });
    }

    nextLineIndex += 1;
  }

  for (let index = 0; index < collapsedRemoved.length; index += 1) {
    if (usedCollapsed.has(index)) {
      continue;
    }
    entries.push({
      kind: 'removed',
      formatted: highlighter.error(`-${collapsedRemoved[index]}`),
    });
  }

  return nextLineIndex;
};

const processHunk = (
  hunk: {
    oldStart: number;
    newStart: number;
    lines: string[];
  },
  newLines: readonly string[]
): {
  entries: HunkEntry[];
  newLineIndex: number;
} => {
  const entries: HunkEntry[] = [];
  let newLineIndex = hunk.newStart - 1;
  let index = 0;

  while (index < hunk.lines.length) {
    const line = hunk.lines[index];

    if (line.startsWith('-')) {
      const removed: string[] = [];
      while (index < hunk.lines.length && hunk.lines[index].startsWith('-')) {
        removed.push(hunk.lines[index].slice(1));
        index += 1;
      }
      while (index < hunk.lines.length && hunk.lines[index].startsWith('\\')) {
        index += 1;
      }

      const added: string[] = [];
      while (index < hunk.lines.length && hunk.lines[index].startsWith('+')) {
        added.push(hunk.lines[index].slice(1));
        index += 1;
      }
      while (index < hunk.lines.length && hunk.lines[index].startsWith('\\')) {
        index += 1;
      }

      newLineIndex = processChangeGroup(
        removed,
        added,
        newLines,
        newLineIndex,
        entries
      );
      continue;
    }

    if (line.startsWith('+')) {
      const actual = newLines[newLineIndex] ?? line.slice(1);
      entries.push({
        kind: 'added',
        formatted: highlighter.success(`+${actual}`),
      });
      newLineIndex += 1;
      index += 1;
      continue;
    }

    if (line.startsWith('\\')) {
      index += 1;
      continue;
    }

    const actual = newLines[newLineIndex] ?? line.slice(1);
    entries.push({ kind: 'context', formatted: dimLine(` ${actual}`) });
    newLineIndex += 1;
    index += 1;
  }

  return { entries, newLineIndex };
};

const computeUnifiedDiff = (
  oldValue: string,
  newValue: string,
  filePath: string
): string[] => {
  if (isFormattingOnly(oldValue, newValue)) {
    return [
      dimLine('  Formatting-only changes (spacing, quotes, semicolons).'),
    ];
  }

  const normalizedOld = normalizeFileForDiff(oldValue);
  const normalizedNew = normalizeFileForDiff(newValue);
  const patch = structuredPatch(
    `a/${filePath}`,
    `b/${filePath}`,
    normalizedOld,
    normalizedNew,
    '',
    '',
    { context: 3 }
  );

  if (patch.hunks.length === 0) {
    return [dimLine('  No changes.')];
  }

  const output: string[] = [
    dimLine(`--- a/${filePath}`),
    dimLine(`+++ b/${filePath}`),
  ];
  const newLines = newValue.split('\n');

  for (const hunk of patch.hunks) {
    const { entries } = processHunk(hunk, newLines);
    if (!entries.some((entry) => entry.kind !== 'context')) {
      continue;
    }

    const contextCount = entries.filter(
      (entry) => entry.kind === 'context'
    ).length;
    const removedCount = entries.filter(
      (entry) => entry.kind === 'removed'
    ).length;
    const addedCount = entries.filter((entry) => entry.kind === 'added').length;

    output.push(
      highlighter.info(
        `@@ -${hunk.oldStart},${contextCount + removedCount} +${hunk.newStart},${
          contextCount + addedCount
        } @@`
      )
    );
    output.push(...entries.map((entry) => entry.formatted));
  }

  return output.length > 2
    ? output
    : [dimLine('  Formatting-only changes (spacing, quotes, semicolons).')];
};

const renderDiff = (file: PluginInstallPlanFile): string[] => {
  if (file.action === 'skip') {
    return [dimLine('  No changes.')];
  }
  if (file.action === 'create' || !file.existingContent) {
    return file.content
      .trimEnd()
      .split('\n')
      .map((line) => highlighter.success(`+${line}`));
  }

  return computeUnifiedDiff(file.existingContent, file.content, file.path);
};

export const resolvePlanPathMatches = (
  files: readonly PluginInstallPlanFile[],
  filterPath: string
): PluginInstallPlanFile[] => {
  const normalizedFilter = normalizePath(filterPath);
  const exactMatches = files.filter((file) => file.path === normalizedFilter);
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const substringMatches = files.filter((file) =>
    file.path.includes(normalizedFilter)
  );
  if (substringMatches.length > 0) {
    return substringMatches;
  }

  return files.filter((file) => file.path.endsWith(normalizedFilter));
};

export const formatPlanSummary = (plan: PluginInstallPlan): string => {
  const changedFiles = plan.files.filter((file) => file.action !== 'skip');
  const visibleFiles = plan.files.slice(0, MAX_OVERVIEW_FILES);
  const lines = [
    renderHeader(`better-convex add ${plan.plugin}`, '(dry run)'),
    dimLine('│'),
    `${dimLine('│')} ${dimLine(
      `preset ${plan.preset} • selection ${plan.selectionSource}`
    )}`,
    renderSectionTitle(
      'Files',
      `${changedFiles.length}/${plan.files.length} changed`
    ),
    ...visibleFiles.map((file) => renderSummaryFileLine(file)),
  ];

  if (plan.files.length > MAX_OVERVIEW_FILES) {
    lines.push(
      `${dimLine('│')} ${dimLine(
        `... ${plan.files.length - MAX_OVERVIEW_FILES} more files; use --diff <path> or --view <path>.`
      )}`
    );
  }

  lines.push(dimLine('│'));
  lines.push(
    renderSectionTitle('Operations', `${plan.operations.length} queued`)
  );
  lines.push(
    ...plan.operations.map((operation) => renderSummaryOperationLine(operation))
  );

  if (plan.envReminders.length > 0) {
    lines.push(dimLine('│'));
    lines.push(renderSectionTitle('Environment'));
    lines.push(
      ...plan.envReminders.map(
        (reminder) =>
          `${dimLine('│')} ${dimLine('•')} ${highlighter.path(reminder.key)} ${dimLine(
            `→ ${reminder.path}`
          )}${reminder.message ? ` ${dimLine(reminder.message)}` : ''}`
      )
    );
  }

  lines.push(dimLine('│'));
  lines.push(
    `${dimLine('│')} ${dimLine('Run with --diff to inspect patches.')}`
  );
  lines.push(
    `${dimLine('│')} ${dimLine('Run with --view to inspect rendered files.')}`
  );
  lines.push(
    `${dimLine('└')} ${dimLine('Run without --dry-run to apply. use --diff <path> or --view <path>.')}`
  );

  return lines.join('\n');
};

export const formatPlanDiff = (
  plan: PluginInstallPlan,
  filterPath?: string | true
): string => {
  const changedFiles = plan.files.filter((file) => file.action !== 'skip');
  const files =
    typeof filterPath === 'string'
      ? resolvePlanPathMatches(plan.files, filterPath)
      : changedFiles.slice(0, MAX_OVERVIEW_FILES);

  if (files.length === 0) {
    return typeof filterPath === 'string'
      ? `No planned file matching "${filterPath}".`
      : 'No planned file changes.';
  }

  const lines = [
    renderHeader(`better-convex add ${plan.plugin}`, '(dry run)'),
    dimLine('│'),
  ];

  for (const file of files) {
    lines.push(
      `${dimLine('├')} ${highlighter.path(file.path)} ${dimLine('(')}${actionLabel(
        file.action
      )}${dimLine(')')}`
    );
    lines.push(...renderContentBox(renderDiff(file)));
    lines.push(dimLine('│'));
  }

  if (
    typeof filterPath !== 'string' &&
    changedFiles.length > MAX_OVERVIEW_FILES
  ) {
    lines.push(
      `${dimLine('│')} ${dimLine(
        `Showing ${MAX_OVERVIEW_FILES} of ${changedFiles.length} files. Use --diff <path> to focus one file.`
      )}`
    );
  }

  lines.push(`${dimLine('└')} ${dimLine('Run without --dry-run to apply.')}`);

  return lines.join('\n');
};

export const formatPlanView = (
  plan: PluginInstallPlan,
  filterPath?: string | true
): string => {
  const files =
    typeof filterPath === 'string'
      ? resolvePlanPathMatches(plan.files, filterPath)
      : plan.files.slice(0, MAX_OVERVIEW_FILES);

  if (files.length === 0) {
    return typeof filterPath === 'string'
      ? `No planned file matching "${filterPath}".`
      : 'No planned files.';
  }

  const lines = [
    renderHeader(`better-convex add ${plan.plugin}`, '(dry run)'),
    dimLine('│'),
  ];

  for (const file of files) {
    lines.push(
      `${dimLine('├')} ${highlighter.path(file.path)} ${dimLine('(')}${actionLabel(
        file.action
      )}${dimLine(')')} ${dimLine(`${file.content.split('\n').length} lines`)}`
    );
    lines.push(...renderContentBox(file.content.trimEnd().split('\n')));
    lines.push(dimLine('│'));
  }

  if (
    typeof filterPath !== 'string' &&
    plan.files.length > MAX_OVERVIEW_FILES
  ) {
    lines.push(
      `${dimLine('│')} ${dimLine(
        `Showing ${MAX_OVERVIEW_FILES} of ${plan.files.length} files. Use --view <path> to focus one file.`
      )}`
    );
  }

  lines.push(`${dimLine('└')} ${dimLine('Run without --dry-run to apply.')}`);

  return lines.join('\n');
};

export const formatPluginView = (plan: PluginInstallPlan): string => {
  const lines = [
    renderHeader(`better-convex view ${plan.plugin}`),
    dimLine('│'),
    `${dimLine('│')} ${dimLine(
      `preset ${plan.preset} • selection ${plan.selectionSource}`
    )}`,
    `${dimLine('│')} ${dimLine(`docs ${plan.docs.publicUrl}`)}`,
    dimLine('│'),
    renderSectionTitle('Files', `${plan.files.length} tracked`),
    ...plan.files.map((file) => renderSummaryFileLine(file)),
    dimLine('│'),
    renderSectionTitle('Operations', `${plan.operations.length} steps`),
    ...plan.operations.map((operation) =>
      renderSummaryOperationLine(operation)
    ),
    `${dimLine('└')} ${dimLine(plan.docs.localPath)}`,
  ];

  return lines.join('\n');
};
