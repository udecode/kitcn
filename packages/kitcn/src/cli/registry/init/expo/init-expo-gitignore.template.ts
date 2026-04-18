const EXPO_ENV_TYPES_IGNORE_LINE = 'expo-env.d.ts';

export function renderInitExpoGitignoreTemplate(source = ''): string {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  const nextLines = lines.filter((line) => line !== EXPO_ENV_TYPES_IGNORE_LINE);

  return `${nextLines.join('\n')}\n`;
}
