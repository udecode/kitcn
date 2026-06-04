const START_GITIGNORE_GROUPS = [
  [
    'node_modules',
    '.DS_Store',
    'dist',
    'dist-ssr',
    '*.local',
    '.env*',
    '.tanstack',
    '.wrangler',
    '.output',
    '.vinxi',
    '__unconfig*',
    'todos.json',
  ],
  ['# typescript', '*.tsbuildinfo', '.convex/', '.concave/'],
] as const;

const LINE_SPLIT_RE = /\r?\n/;

function hasGitignoreLine(existing: Set<string>, entry: string): boolean {
  if (existing.has(entry)) {
    return true;
  }
  if (entry.endsWith('/')) {
    return existing.has(entry.slice(0, -1));
  }
  return existing.has(`${entry}/`);
}

export function renderInitStartGitignoreTemplate(source = ''): string {
  const lines = source.split(LINE_SPLIT_RE).map((line) => line.trimEnd());
  while (lines.at(-1) === '') {
    lines.pop();
  }

  const existing = new Set(
    lines.map((line) => line.trim()).filter((line) => line.length > 0)
  );
  const nextLines = [...lines];

  for (const group of START_GITIGNORE_GROUPS) {
    const missing = group.filter((line) => !hasGitignoreLine(existing, line));
    if (missing.length === 0) {
      continue;
    }
    if (nextLines.length > 0 && nextLines.at(-1) !== '') {
      nextLines.push('');
    }
    nextLines.push(...missing);
  }

  return `${nextLines.join('\n')}\n`;
}
