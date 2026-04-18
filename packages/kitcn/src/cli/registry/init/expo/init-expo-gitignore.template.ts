const EXPO_ENV_TYPES_IGNORE_LINE = 'expo-env.d.ts';
const LINE_SPLIT_RE = /\r?\n/;

export function renderInitExpoGitignoreTemplate(source = ''): string {
  const lines = source
    .split(LINE_SPLIT_RE)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  const nextLines = lines.filter((line) => line !== EXPO_ENV_TYPES_IGNORE_LINE);

  return `${nextLines.join('\n')}\n`;
}
