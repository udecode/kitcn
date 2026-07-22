#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NEWLINE = /\r?\n/;
const TABLE_SEPARATOR_CELL = /^:?-+:?$/;
const EXACT_PLACEHOLDER = /^(?:pending|todo|tbd|none yet)\.?$/i;
const TODO_WORD = /\b(?:TODO|TBD)\b/i;
const UNCHECKED_CHECKBOX = /^-\s+\[\s\](?:\s|$)/;
const CODE_FENCE = /^```/;
const BULLET_PREFIX = /^-\s+/;
const LABELED_PLACEHOLDER =
  /^-\s+[^:\n]+:\s*(?:pending|todo|tbd|none yet)\.?$/i;

export class PlanPlaceholderAuditError extends Error {
  constructor(failures) {
    super('unresolved plan placeholders');
    this.name = 'PlanPlaceholderAuditError';
    this.failures = failures;
  }
}

export async function runPlanPlaceholderAudit(
  planArg,
  { cwd = process.cwd() } = {}
) {
  const root = findRepoRoot(cwd);
  const planPath = path.resolve(root, planArg);
  const relativePlanPath = path.relative(root, planPath);

  if (
    relativePlanPath.startsWith('..') ||
    path.isAbsolute(relativePlanPath) ||
    !relativePlanPath.startsWith(`docs${path.sep}plans${path.sep}`)
  ) {
    throw new PlanPlaceholderAuditError([
      `plan must live under docs/plans/: ${planArg}`,
    ]);
  }

  if (!existsSync(planPath)) {
    throw new PlanPlaceholderAuditError([
      `plan not found: ${relativePlanPath}`,
    ]);
  }

  const content = await readFile(planPath, 'utf8');
  const failures = findPlanPlaceholderFailures(content);

  if (failures.length > 0) {
    throw new PlanPlaceholderAuditError(
      failures.map(
        (failure) => `line ${failure.line}: ${failure.reason}: ${failure.text}`
      )
    );
  }

  return { relativePlanPath };
}

export function findPlanPlaceholderFailures(content) {
  const failures = [];
  let inCodeFence = false;
  const lines = content.split(NEWLINE);

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();

    if (CODE_FENCE.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence || !line) {
      continue;
    }

    if (UNCHECKED_CHECKBOX.test(line)) {
      failures.push({
        line: lineNumber,
        reason: 'unchecked checklist item',
        text: rawLine,
      });
      continue;
    }

    if (TODO_WORD.test(line)) {
      failures.push({
        line: lineNumber,
        reason: 'TODO/TBD placeholder',
        text: rawLine,
      });
      continue;
    }

    if (
      BULLET_PREFIX.test(line) &&
      EXACT_PLACEHOLDER.test(line.replace(BULLET_PREFIX, ''))
    ) {
      failures.push({
        line: lineNumber,
        reason: 'bare placeholder bullet',
        text: rawLine,
      });
      continue;
    }

    if (LABELED_PLACEHOLDER.test(line)) {
      failures.push({
        line: lineNumber,
        reason: 'labeled placeholder bullet',
        text: rawLine,
      });
      continue;
    }

    if (line.startsWith('|')) {
      const parts = line.split('|');
      const cells = (
        line.endsWith('|') ? parts.slice(1, -1) : parts.slice(1)
      ).map((cell) => cell.trim());

      if (
        cells.length > 0 &&
        !cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell))
      ) {
        for (const cell of cells) {
          if (EXACT_PLACEHOLDER.test(cell)) {
            failures.push({
              line: lineNumber,
              reason: 'bare placeholder table cell',
              text: rawLine,
            });
            break;
          }
        }
      }
    }
  }

  return failures;
}

function findRepoRoot(start) {
  let current = path.resolve(start);

  while (true) {
    if (existsSync(path.join(current, 'AGENTS.md'))) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error('could not find repo root containing AGENTS.md');
    }

    current = parent;
  }
}

function fail(failures) {
  process.stderr.write('[auto-plan] unresolved placeholders\n');
  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`);
  }
  process.exit(1);
}

function printHelp() {
  process.stdout.write(`Usage:
  node .agents/rules/auto/scripts/check-plan-placeholders.mjs docs/plans/<plan>.md

Fails when an auto plan still contains unresolved TODO/TBD markers, unchecked
checklist items, or bare placeholder cells such as "pending". Use explicit
"N/A: <reason>" or "blocked: <reason>" instead.\n`);
}

async function main(args) {
  if (args.length !== 1 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(args.length === 1 ? 0 : 1);
  }

  try {
    const { relativePlanPath } = await runPlanPlaceholderAudit(args[0]);
    process.stdout.write(
      `[auto-plan] placeholder audit passed: ${relativePlanPath}\n`
    );
  } catch (error) {
    if (error instanceof PlanPlaceholderAuditError) {
      fail(error.failures);
    }

    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main(process.argv.slice(2));
}
