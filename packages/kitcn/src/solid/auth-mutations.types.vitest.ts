import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const formatDiagnostics = (diagnostics: readonly ts.Diagnostic[]) =>
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  });

describe('createAuthMutations solid types', () => {
  test('accepts a username sign-in method from Better Auth plugins', () => {
    const rootDir = process.cwd();
    const tmpRoot = path.join(rootDir, 'tmp');
    fs.mkdirSync(tmpRoot, { recursive: true });
    const fixtureDir = fs.mkdtempSync(
      path.join(tmpRoot, 'kitcn-solid-auth-mutations-types-')
    );
    const fixtureFile = path.join(fixtureDir, 'repro.ts');

    try {
      fs.writeFileSync(
        fixtureFile,
        `import { createAuthClient } from "better-auth/solid";
import { usernameClient } from "better-auth/client/plugins";
import { convexClient } from "../../packages/kitcn/src/auth-client/index";
import { createAuthMutations } from "../../packages/kitcn/src/solid/auth-mutations";

const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [usernameClient(), convexClient()],
});

const { useSignInMutationOptions } = createAuthMutations(authClient);
useSignInMutationOptions({ signInMethod: "username" });
`
      );

      const program = ts.createProgram([fixtureFile], {
        allowImportingTsExtensions: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        strictFunctionTypes: true,
        target: ts.ScriptTarget.ES2022,
        types: ['bun-types'],
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);

      expect(formatDiagnostics(diagnostics)).toBe('');
    } finally {
      fs.rmSync(fixtureDir, { force: true, recursive: true });
    }
  });
});
