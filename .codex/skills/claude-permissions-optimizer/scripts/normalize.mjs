// Normalization helpers extracted from extract-commands.mjs for testability.

// Risk-modifying flags that must NOT be collapsed into wildcards.
// Global flags are always preserved; context-specific flags only matter
// for certain base commands.
const GLOBAL_RISK_FLAGS = new Set([
  '--force',
  '--hard',
  '-rf',
  '--privileged',
  '--no-verify',
  '--system',
  '--force-with-lease',
  '-D',
  '--force-if-includes',
  '--volumes',
  '--rmi',
  '--rewrite',
  '--delete',
]);

// Flags that are only risky for specific base commands.
// -f means force-push in git, force-remove in docker, but pattern-file in grep.
// -v means remove-volumes in docker-compose, but verbose everywhere else.
const CONTEXTUAL_RISK_FLAGS = {
  '-f': new Set(['git', 'docker', 'rm']),
  '-v': new Set(['docker', 'docker-compose']),
};

const COMBINED_RISK_FLAGS_RE = /^-[a-zA-Z]*[rf][a-zA-Z]*$/;
const PIPE_TO_SHELL_RE = /\|\s*(sh|bash|zsh)\b/;
const SUDO_RE = /^sudo\s/;
const PNPM_FILTER_RE = /^pnpm\s+--filter\s+\S+\s+(\S+)/;
const SED_RE = /^sed\s/;
const SED_INPLACE_RE = /\s-i\b/;
const SED_FLAG_RE = /^sed\s+(-[a-zA-Z])\s/;
const AST_GREP_RE = /^(ast-grep|sg)\s/;
const AST_GREP_REWRITE_RE = /\s--rewrite\b/;
const FIND_RE = /^find\s/;
const FIND_DELETE_RE = /\s-delete\b/;
const FIND_EXEC_RE = /\s-exec\s/;
const FIND_FLAG_RE = /\s(-(?:name|type|path|iname))\s/;
const GIT_C_RE = /^git\s+-C\s+\S+\s+(.+)$/;
const COMPOUND_RE = /^(.+?)\s*(&&|\|\||;)\s*(.+)$/;
const PIPE_RE = /^(.+?)\s*\|\s*(.+)$/;
const TRAILING_REDIRECT_RE = /\s*[12]?>>?\s*\S+\s*$/;
const TRAILING_STDERR_RE = /\s*2>&1\s*$/;
const SPLIT_WHITESPACE_RE = /\s+/;

export function isRiskFlag(token, base) {
  if (GLOBAL_RISK_FLAGS.has(token)) return true;
  // Check context-specific flags
  const contexts = Object.hasOwn(CONTEXTUAL_RISK_FLAGS, token)
    ? CONTEXTUAL_RISK_FLAGS[token]
    : undefined;
  if (contexts && base && contexts.has(base)) return true;
  // Combined short flags containing risk chars: -rf, -fr, -fR, etc.
  if (COMBINED_RISK_FLAGS_RE.test(token) && token.length <= 4) return true;
  return false;
}

export function normalize(command) {
  // Don't normalize shell injection patterns
  if (PIPE_TO_SHELL_RE.test(command)) return command;
  // Don't normalize sudo -- keep as-is
  if (SUDO_RE.test(command)) return 'sudo *';

  // Handle pnpm --filter <pkg> <subcommand> specially
  const pnpmFilter = command.match(PNPM_FILTER_RE);
  if (pnpmFilter) return `pnpm --filter * ${pnpmFilter[1]} *`;

  // Handle sed specially -- preserve the mode flag to keep safe patterns narrow.
  // sed -i (in-place) is destructive; sed -n, sed -e, bare sed are read-only.
  if (SED_RE.test(command)) {
    if (SED_INPLACE_RE.test(command)) return 'sed -i *';
    const sedFlag = command.match(SED_FLAG_RE);
    return sedFlag ? `sed ${sedFlag[1]} *` : 'sed *';
  }

  // Handle ast-grep specially -- preserve --rewrite flag.
  if (AST_GREP_RE.test(command)) {
    const base = command.startsWith('sg') ? 'sg' : 'ast-grep';
    return AST_GREP_REWRITE_RE.test(command)
      ? `${base} --rewrite *`
      : `${base} *`;
  }

  // Handle find specially -- preserve key action flags.
  // find -delete and find -exec rm are destructive; find -name/-type are safe.
  if (FIND_RE.test(command)) {
    if (FIND_DELETE_RE.test(command)) return 'find -delete *';
    if (FIND_EXEC_RE.test(command)) return 'find -exec *';
    // Extract the first predicate flag for a narrower safe pattern
    const findFlag = command.match(FIND_FLAG_RE);
    return findFlag ? `find ${findFlag[1]} *` : 'find *';
  }

  // Handle git -C <dir> <subcommand> -- strip the -C <dir> and normalize the git subcommand
  const gitC = command.match(GIT_C_RE);
  if (gitC) return normalize(`git ${gitC[1]}`);

  // Split on compound operators -- normalize the first command only
  const compoundMatch = command.match(COMPOUND_RE);
  if (compoundMatch) {
    return normalize(compoundMatch[1].trim());
  }

  // Strip trailing pipe chains for normalization (e.g., `cmd | tail -5`)
  // but preserve pipe-to-shell (already handled by shell injection check above)
  const pipeMatch = command.match(PIPE_RE);
  if (pipeMatch) {
    return normalize(pipeMatch[1].trim());
  }

  // Strip trailing redirections (2>&1, > file, >> file)
  const cleaned = command
    .replace(TRAILING_REDIRECT_RE, '')
    .replace(TRAILING_STDERR_RE, '')
    .trim();

  const parts = cleaned.split(SPLIT_WHITESPACE_RE);
  if (parts.length === 0) return command;

  const base = parts[0];

  // For git/docker/gh/npm etc, include the subcommand
  const multiWordBases = [
    'git',
    'docker',
    'docker-compose',
    'gh',
    'npm',
    'bun',
    'pnpm',
    'yarn',
    'cargo',
    'pip',
    'pip3',
    'bundle',
    'systemctl',
    'kubectl',
  ];

  let prefix = base;
  let argStart = 1;

  if (multiWordBases.includes(base) && parts.length > 1) {
    prefix = `${base} ${parts[1]}`;
    argStart = 2;
  }

  // Preserve risk-modifying flags in the remaining args
  const preservedFlags = [];
  for (let i = argStart; i < parts.length; i++) {
    if (isRiskFlag(parts[i], base)) {
      preservedFlags.push(parts[i]);
    }
  }

  // Build the normalized pattern
  if (parts.length <= argStart && preservedFlags.length === 0) {
    return prefix; // no args, no flags: e.g., "git status"
  }

  const flagStr =
    preservedFlags.length > 0 ? ` ${preservedFlags.join(' ')}` : '';
  const hasVaryingArgs = parts.length > argStart + preservedFlags.length;

  if (hasVaryingArgs) {
    return `${prefix}${flagStr} *`;
  }
  return `${prefix}${flagStr}`;
}
