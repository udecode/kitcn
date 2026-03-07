import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const MARKERS = {
  return: '/*RETURN*/',
} as const;

function createLanguageService(fileName: string) {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
  };

  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => [fileName],
    getScriptVersion: () => '0',
    getScriptSnapshot: (targetFileName) => {
      if (!fs.existsSync(targetFileName)) {
        return undefined;
      }
      return ts.ScriptSnapshot.fromString(
        fs.readFileSync(targetFileName, 'utf8')
      );
    },
    getCurrentDirectory: () => process.cwd(),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: fs.existsSync,
    readFile: (targetFileName) =>
      fs.existsSync(targetFileName)
        ? fs.readFileSync(targetFileName, 'utf8')
        : undefined,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  return ts.createLanguageService(host);
}

function getCompletionNames(source: string, marker: string) {
  const fixtureDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'better-convex-schema-completion-')
  );
  const fileName = path.join(fixtureDir, 'fixture.ts');
  fs.writeFileSync(fileName, source);

  try {
    const languageService = createLanguageService(fileName);
    const position = source.indexOf(marker);
    expect(position).toBeGreaterThanOrEqual(0);

    const completions = languageService.getCompletionsAtPosition(
      fileName,
      position,
      {}
    );
    return completions?.entries.map((entry) => entry.name) ?? [];
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
}

test('defineSchema relations callback keeps contextual completions with extensions', () => {
  const source = `
    import {
      convexTable,
      defineSchema,
      defineSchemaExtension,
      id,
      text,
    } from ${JSON.stringify(path.resolve(__dirname, 'index.ts'))};

    const tables = {
      userRow: convexTable('schema_completion_user', {
        name: text().notNull(),
      }),
      sessionRow: convexTable('schema_completion_session', {
        userId: id('schema_completion_user').notNull(),
      }),
    } as const;
    const resendExtension = defineSchemaExtension('resend', {
      resendEmail: convexTable('schema_completion_resend_email', {
        foo: text(),
      }),
    });
    const ratelimitExtension = defineSchemaExtension('ratelimit', {
      ratelimitState: convexTable('schema_completion_ratelimit_state', {
        foo: text(),
      }),
    });

    const extensions = [ratelimitExtension, resendExtension] as const;

    defineSchema(tables)
      .extend(...extensions)
      .relations((r) => ({
        ${MARKERS.return}
        sessionRow: {
          user: r.one.userRow({
            from: r.sessionRow.userId,
            to: r.userRow.id,
          }),
        },
      }));
  `;

  const completionNames = getCompletionNames(source, MARKERS.return);

  expect(completionNames).toContain('userRow');
  expect(completionNames).toContain('ratelimitState');
  expect(completionNames).toContain('resendEmail');
});
