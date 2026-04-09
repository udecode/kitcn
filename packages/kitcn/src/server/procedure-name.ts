export type ProcedureNameEntry = {
  column: number;
  line: number;
  name: string;
};

export type ProcedureNameLookup = Record<string, ProcedureNameEntry[]>;

type StackFrameLike = {
  getColumnNumber?: () => number | null;
  getFileName?: () => string | null;
  getLineNumber?: () => number | null;
};

const LOOKUP_KEY = '__KITCN_PROCEDURE_NAME_LOOKUP__';
const HINTS_KEY = '__KITCN_PROCEDURE_NAME_HINTS__';
const PATH_SEPARATOR_RE = /\\/g;
const TRIM_SLASHES_RE = /^\/+|\/+$/g;
const PACKAGE_FRAME_MARKERS = ['/node_modules/kitcn/', '/packages/kitcn/'];

function decodeFileName(value: string): string {
  if (!value.startsWith('file://')) {
    return value;
  }

  try {
    return decodeURIComponent(new URL(value).pathname);
  } catch {
    return value;
  }
}

function normalizePath(value: string): string {
  return value.replace(PATH_SEPARATOR_RE, '/');
}

function normalizeHint(value: string): string {
  return normalizePath(value).replace(TRIM_SLASHES_RE, '');
}

function getGlobalLookup(): ProcedureNameLookup {
  const globalScope = globalThis as Record<string, unknown>;
  const existing = globalScope[LOOKUP_KEY];

  if (existing && typeof existing === 'object') {
    return existing as ProcedureNameLookup;
  }

  const lookup: ProcedureNameLookup = {};
  globalScope[LOOKUP_KEY] = lookup;
  return lookup;
}

function getGlobalHints(): string[] {
  const globalScope = globalThis as Record<string, unknown>;
  const existing = globalScope[HINTS_KEY];

  if (Array.isArray(existing)) {
    return existing as string[];
  }

  const hints: string[] = [];
  globalScope[HINTS_KEY] = hints;
  return hints;
}

export function registerProcedureNameLookup(
  lookup: ProcedureNameLookup,
  functionsDirHint: string
): void {
  const globalLookup = getGlobalLookup();

  for (const [relativeFilePath, entries] of Object.entries(lookup)) {
    const key = normalizePath(relativeFilePath);
    const existing = globalLookup[key] ?? [];
    const deduped = new Map<string, ProcedureNameEntry>();

    for (const entry of [...existing, ...entries]) {
      deduped.set(`${entry.line}:${entry.column}:${entry.name}`, entry);
    }

    globalLookup[key] = [...deduped.values()].sort(
      (left, right) =>
        left.line - right.line ||
        left.column - right.column ||
        left.name.localeCompare(right.name)
    );
  }

  const normalizedHint = normalizeHint(functionsDirHint);
  if (!normalizedHint) {
    return;
  }

  const hints = getGlobalHints();
  if (!hints.includes(normalizedHint)) {
    hints.push(normalizedHint);
    hints.sort((left, right) => right.length - left.length);
  }
}

type SourceLocation = {
  column: number;
  filePath: string;
  line: number;
};

function isPackageFrame(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return PACKAGE_FRAME_MARKERS.some((marker) => normalized.includes(marker));
}

function captureCallsite(): SourceLocation | undefined {
  const originalPrepareStackTrace = Error.prepareStackTrace;

  try {
    Error.prepareStackTrace = (_error, stack) => stack;
    const frames = new Error(
      'Capture procedure callsite for middleware name inference.'
    ).stack as unknown as StackFrameLike[] | undefined;

    for (const frame of frames ?? []) {
      const rawFileName = frame.getFileName?.();
      if (!rawFileName) {
        continue;
      }

      const filePath = normalizePath(decodeFileName(rawFileName));
      if (filePath.startsWith('node:') || isPackageFrame(filePath)) {
        continue;
      }

      const line = frame.getLineNumber?.();
      const column = frame.getColumnNumber?.();
      if (!line || !column) {
        continue;
      }

      return { filePath, line, column };
    }
  } catch {
    return;
  } finally {
    Error.prepareStackTrace = originalPrepareStackTrace;
  }

  return;
}

function resolveRelativeFilePath(filePath: string): string | undefined {
  const normalizedFilePath = normalizePath(filePath);
  const hints = getGlobalHints();

  for (const hint of hints) {
    const marker = `/${hint}/`;
    const markerIndex = normalizedFilePath.lastIndexOf(marker);
    if (markerIndex >= 0) {
      return normalizedFilePath.slice(markerIndex + marker.length);
    }

    if (normalizedFilePath.startsWith(`${hint}/`)) {
      return normalizedFilePath.slice(hint.length + 1);
    }
  }

  return;
}

function findBestEntry(
  entries: ProcedureNameEntry[],
  location: SourceLocation
): ProcedureNameEntry | undefined {
  const sameLine = entries.filter((entry) => entry.line === location.line);
  if (sameLine.length === 0) {
    return;
  }

  return sameLine.reduce((best, entry) => {
    const bestDistance = Math.abs(best.column - location.column);
    const nextDistance = Math.abs(entry.column - location.column);
    return nextDistance < bestDistance ? entry : best;
  });
}

export function inferProcedureNameFromCallsite(): string | undefined {
  const location = captureCallsite();
  if (!location) {
    return;
  }

  const relativeFilePath = resolveRelativeFilePath(location.filePath);
  if (!relativeFilePath) {
    return;
  }

  const entries = getGlobalLookup()[relativeFilePath];
  if (!entries || entries.length === 0) {
    return;
  }

  return findBestEntry(entries, location)?.name;
}
