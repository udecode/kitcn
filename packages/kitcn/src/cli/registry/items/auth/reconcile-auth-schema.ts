import fs from 'node:fs';
import path from 'node:path';
import type { BetterAuthOptions } from 'better-auth/minimal';
import { createJiti } from 'jiti';
import ts from 'typescript';
import { getAuthConfigProvider } from '../../../../auth/auth-config';
import { createSchema } from '../../../../auth/create-schema';
import { createSchemaExtensionOrm } from '../../../../auth/create-schema-orm';
import type { RootSchemaTableUnit } from '../../schema-ownership.js';

type AuthSchemaTemplateId = 'auth-schema' | 'auth-schema-convex';
type UserOwnedAuthTemplateId =
  | 'auth-config'
  | 'auth-config-convex'
  | 'auth-runtime'
  | 'auth-runtime-convex';

type AuthScaffoldFile = {
  content: string;
  filePath: string;
  lockfilePath: string;
  templateId: string;
};

const AUTH_SCHEMA_TEMPLATE_IDS = new Set<AuthSchemaTemplateId>([
  'auth-schema',
  'auth-schema-convex',
]);
const USER_OWNED_AUTH_TEMPLATE_IDS = new Set<UserOwnedAuthTemplateId>([
  'auth-config',
  'auth-config-convex',
  'auth-runtime',
  'auth-runtime-convex',
]);
const GENERATED_AUTH_IMPORT_RE = /\.\/generated\/auth(?:\.[mc]?[jt]sx?)?/g;
const KITCN_CODEGEN_GLOBAL_KEY = '__KITCN_CODEGEN__';
const DEFAULT_AUTH_SCHEMA_ENV = {
  BETTER_AUTH_SECRET: 'test-secret',
  CONVEX_SITE_URL: 'https://convex.invalid',
  DEPLOY_ENV: 'development',
  SITE_URL: 'http://localhost:3000',
} as const;

const loadGetAuthTables = async () =>
  (await import('better-auth/db')).getAuthTables;
const loadConvexAuthPlugin = async () =>
  (await import('@convex-dev/better-auth/plugins')).convex;

const withAuthSchemaEnv = async <T>(run: () => Promise<T>): Promise<T> => {
  const globalScope = globalThis as Record<string, unknown>;
  const originalEntries = Object.fromEntries(
    Object.keys(DEFAULT_AUTH_SCHEMA_ENV).map((key) => [key, process.env[key]])
  );
  const originalCodegenSentinel = globalScope[KITCN_CODEGEN_GLOBAL_KEY];

  for (const [key, value] of Object.entries(DEFAULT_AUTH_SCHEMA_ENV)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  globalScope[KITCN_CODEGEN_GLOBAL_KEY] = true;

  try {
    return await run();
  } finally {
    if (typeof originalCodegenSentinel === 'undefined') {
      delete globalScope[KITCN_CODEGEN_GLOBAL_KEY];
    } else {
      globalScope[KITCN_CODEGEN_GLOBAL_KEY] = originalCodegenSentinel;
    }
    for (const [key, value] of Object.entries(originalEntries)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
};

export const renderManagedAuthSchemaFile = async ({
  authOptions,
  kind,
  outputPath,
}: {
  authOptions: BetterAuthOptions;
  kind: 'convex' | 'extension';
  outputPath: string;
}) => {
  const getAuthTables = await loadGetAuthTables();
  const tables = getAuthTables(authOptions);
  if (kind === 'extension') {
    const result = await createSchemaExtensionOrm({
      extensionKey: 'auth',
      exportName: 'authExtension',
      file: outputPath,
      regenerateCommand: 'npx kitcn add auth --yes',
      tables,
    });
    return result.code;
  }

  const result = await createSchema({
    exportName: 'authSchema',
    file: outputPath,
    regenerateCommand: 'npx kitcn add auth --preset convex --yes',
    tables,
  });
  return result.code;
};

const parseRootSchemaUnitsFromExtension = (
  source: string
): RootSchemaTableUnit[] => {
  const sourceFile = ts.createSourceFile(
    'auth-schema.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const ormImport = sourceFile.statements.find(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'kitcn/orm'
  );
  const importNames =
    ormImport &&
    ts.isImportDeclaration(ormImport) &&
    ormImport.importClause?.namedBindings &&
    ts.isNamedImports(ormImport.importClause.namedBindings)
      ? ormImport.importClause.namedBindings.elements
          .map((element) => element.getText(sourceFile))
          .filter((name) => name !== 'defineSchemaExtension')
      : [];

  const declarations = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        declaration.initializer &&
        ts.isCallExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        declaration.initializer.expression.text === 'convexTable'
      ) {
        const firstArg = declaration.initializer.arguments[0];
        if (
          firstArg &&
          (ts.isStringLiteral(firstArg) ||
            ts.isNoSubstitutionTemplateLiteral(firstArg))
        ) {
          declarations.set(firstArg.text, statement.getText(sourceFile));
        }
      }
    }
  }

  let registrationObject: ts.ObjectLiteralExpression | null = null;
  let relationObject: ts.ObjectLiteralExpression | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'defineSchemaExtension'
      ) {
        const secondArg = node.arguments[1];
        if (
          secondArg &&
          ts.isObjectLiteralExpression(secondArg) &&
          !registrationObject
        ) {
          registrationObject = secondArg;
        }
      }

      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'relations' &&
        ts.isCallExpression(node.expression.expression) &&
        ts.isIdentifier(node.expression.expression.expression) &&
        node.expression.expression.expression.text === 'defineSchemaExtension'
      ) {
        const secondArg = node.expression.expression.arguments[1];
        if (
          secondArg &&
          ts.isObjectLiteralExpression(secondArg) &&
          !registrationObject
        ) {
          registrationObject = secondArg;
        }

        const firstArg = node.arguments[0];
        if (firstArg && ts.isArrowFunction(firstArg)) {
          const body = ts.isParenthesizedExpression(firstArg.body)
            ? firstArg.body.expression
            : firstArg.body;
          if (ts.isObjectLiteralExpression(body) && !relationObject) {
            relationObject = body;
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (!registrationObject) {
    return [];
  }
  const registrationObjectLiteral =
    registrationObject as ts.ObjectLiteralExpression;
  const relationObjectLiteral =
    relationObject as ts.ObjectLiteralExpression | null;

  const relationMap = new Map<string, string>();
  const relationProperties: readonly ts.ObjectLiteralElementLike[] =
    relationObjectLiteral?.properties ?? [];
  for (const property of relationProperties) {
    if (
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ) {
      const key = ts.isIdentifier(property.name)
        ? property.name.text
        : property.name.text;
      relationMap.set(key, property.getText(sourceFile));
    }
  }

  const registrationProperties: readonly ts.ObjectLiteralElementLike[] =
    registrationObjectLiteral.properties;
  return registrationProperties.flatMap(
    (property: ts.ObjectLiteralElementLike) => {
      if (
        !ts.isPropertyAssignment(property) &&
        !ts.isShorthandPropertyAssignment(property)
      ) {
        return [];
      }

      const propertyName = property.name;
      if (!ts.isIdentifier(propertyName) && !ts.isStringLiteral(propertyName)) {
        return [];
      }

      const key = ts.isIdentifier(propertyName)
        ? propertyName.text
        : propertyName.text;
      const declaration = declarations.get(key);
      if (!declaration) {
        return [];
      }

      return [
        {
          declaration,
          importNames,
          key,
          registration: property.getText(sourceFile),
          relations: relationMap.get(key),
        } satisfies RootSchemaTableUnit,
      ];
    }
  );
};

export const renderManagedAuthSchemaUnits = async ({
  authOptions,
}: {
  authOptions: BetterAuthOptions;
}) =>
  parseRootSchemaUnitsFromExtension(
    await renderManagedAuthSchemaFile({
      authOptions,
      kind: 'extension',
      outputPath: 'convex/lib/plugins/auth/schema.ts',
    })
  );

export const loadDefaultManagedAuthConfigProvider = async () =>
  withAuthSchemaEnv(async () => getAuthConfigProvider());

export const loadDefaultManagedAuthOptions =
  async (): Promise<BetterAuthOptions> => {
    const provider = await loadDefaultManagedAuthConfigProvider();
    const convex = await loadConvexAuthPlugin();

    return withAuthSchemaEnv(async () => ({
      baseURL: process.env.SITE_URL!,
      emailAndPassword: { enabled: true },
      plugins: [
        convex({
          authConfig: {
            providers: [provider],
          },
        }),
      ],
      trustedOrigins: [process.env.SITE_URL!],
    }));
  };

export const loadAuthOptionsFromDefinition = async (
  authDefinitionPath: string
): Promise<BetterAuthOptions | null> => {
  if (!fs.existsSync(authDefinitionPath)) {
    return null;
  }

  return withAuthSchemaEnv(async () => {
    const tempId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const authDir = path.dirname(authDefinitionPath);
    const generatedDir = path.join(authDir, 'generated');
    const tempAuthPath = path.join(authDir, `.tmp-kitcn-auth-${tempId}.ts`);
    const tempGeneratedAuthBase = `.tmp-kitcn-define-auth-${tempId}`;
    const tempGeneratedAuthPath = path.join(
      generatedDir,
      `${tempGeneratedAuthBase}.ts`
    );
    const authSource = fs.readFileSync(authDefinitionPath, 'utf8');
    const importPath = authSource.includes('./generated/auth')
      ? tempAuthPath
      : authDefinitionPath;

    if (importPath === tempAuthPath) {
      fs.mkdirSync(generatedDir, { recursive: true });
      fs.writeFileSync(
        tempGeneratedAuthPath,
        'export const defineAuth = (factory) => factory;\n',
        'utf8'
      );
      fs.writeFileSync(
        tempAuthPath,
        authSource.replaceAll(
          GENERATED_AUTH_IMPORT_RE,
          `./generated/${tempGeneratedAuthBase}`
        ),
        'utf8'
      );
    }

    try {
      const jiti = createJiti(importPath, {
        interopDefault: true,
        moduleCache: false,
      });
      const authModule = await jiti.import(importPath);
      const authDefinition =
        authModule && typeof authModule === 'object'
          ? (authModule as Record<string, unknown>).default
          : null;

      if (typeof authDefinition !== 'function') {
        return null;
      }

      const authOptions = authDefinition({});
      if (!authOptions || typeof authOptions !== 'object') {
        return null;
      }

      return authOptions as BetterAuthOptions;
    } finally {
      if (importPath === tempAuthPath) {
        fs.rmSync(tempAuthPath, { force: true });
        fs.rmSync(tempGeneratedAuthPath, { force: true });
      }
    }
  });
};

export const preserveUserOwnedAuthScaffoldFiles = (
  scaffoldFiles: readonly AuthScaffoldFile[]
) =>
  scaffoldFiles.map((file) => {
    if (
      !USER_OWNED_AUTH_TEMPLATE_IDS.has(
        file.templateId as UserOwnedAuthTemplateId
      ) ||
      !fs.existsSync(file.filePath)
    ) {
      return file;
    }

    return {
      ...file,
      content: fs.readFileSync(file.filePath, 'utf8'),
    };
  });

export const reconcileAuthScaffoldFiles = async ({
  functionsDir,
  loadAuthOptions = loadAuthOptionsFromDefinition,
  scaffoldFiles,
}: {
  functionsDir: string;
  loadAuthOptions?: (
    authDefinitionPath: string
  ) => Promise<BetterAuthOptions | null>;
  scaffoldFiles: readonly AuthScaffoldFile[];
}) => {
  const authScaffoldFiles = scaffoldFiles.filter((file) =>
    AUTH_SCHEMA_TEMPLATE_IDS.has(file.templateId as AuthSchemaTemplateId)
  );
  if (authScaffoldFiles.length === 0) {
    return scaffoldFiles;
  }

  const authOptions = await loadAuthOptions(path.join(functionsDir, 'auth.ts'));
  if (!authOptions) {
    return scaffoldFiles;
  }

  const nextFiles = [...scaffoldFiles];
  for (const file of authScaffoldFiles) {
    const outputPath = file.lockfilePath.replaceAll('\\', '/');
    const content = await renderManagedAuthSchemaFile({
      authOptions,
      kind: file.templateId === 'auth-schema' ? 'extension' : 'convex',
      outputPath,
    });
    const index = nextFiles.findIndex(
      (candidate) => candidate.filePath === file.filePath
    );
    if (index !== -1) {
      nextFiles[index] = {
        ...nextFiles[index]!,
        content,
      };
    }
  }

  return nextFiles;
};
