import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ResolvedScaffoldRoots, ScaffoldTemplate } from '../types.js';
import { getPluginCatalogEntry } from './index.js';
import {
  collectPluginScaffoldTemplates,
  promptForScaffoldTemplateSelection,
  resolvePresetScaffoldTemplates,
  resolveTemplatesByIdOrThrow,
} from './selection.js';

const createRoots = (cwd: string): ResolvedScaffoldRoots => ({
  functionsRootDir: path.join(cwd, 'convex', 'functions'),
  libRootDir: path.join(cwd, 'convex', 'lib'),
  appRootDir: null,
  clientLibRootDir: null,
  crpcFilePath: path.join(cwd, 'convex', 'lib', 'crpc.ts'),
  sharedApiFilePath: path.join(cwd, 'convex', 'shared', 'api.ts'),
  envFilePath: path.join(cwd, 'convex', 'lib', 'get-env.ts'),
  projectContext: null,
});

describe('promptForScaffoldTemplateSelection', () => {
  test('scopes auth options to the resolved preset', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-selection-auth-preset-')
    );

    try {
      const descriptor = getPluginCatalogEntry('auth');
      const allTemplates = collectPluginScaffoldTemplates(descriptor);
      const presetTemplateIds = resolvePresetScaffoldTemplates(
        descriptor,
        'default'
      ).map((template) => template.id);
      const selectableTemplates = resolveTemplatesByIdOrThrow(
        descriptor,
        allTemplates,
        presetTemplateIds,
        'selection test'
      );
      const multiselectPromptStub = mock(
        async <TValue extends string>(params: {
          initialValues?: readonly TValue[];
        }) => params.initialValues ?? []
      );

      const selectedTemplateIds = await promptForScaffoldTemplateSelection(
        {
          multiselect: multiselectPromptStub as any,
        } as any,
        descriptor,
        selectableTemplates,
        presetTemplateIds,
        createRoots(dir)
      );

      const callArgs = (
        multiselectPromptStub.mock.calls[0] as unknown[]
      )[0] as {
        initialValues: string[];
        options: Array<{ label: string; value: string }>;
      };
      const expectedLabels = [
        path.relative(
          process.cwd(),
          path.join(dir, 'convex', 'functions', 'auth', 'page.tsx')
        ),
        path.relative(
          process.cwd(),
          path.join(dir, 'convex', 'functions', 'convex', 'auth-client.ts')
        ),
        path.relative(
          process.cwd(),
          path.join(dir, 'convex', 'functions', 'auth.config.ts')
        ),
        path.relative(
          process.cwd(),
          path.join(dir, 'convex', 'functions', 'auth.ts')
        ),
      ].map((label) => label.replaceAll('\\', '/'));

      expect(callArgs.options.map((option) => option.label)).toEqual(
        expectedLabels
      );
      expect(
        callArgs.options.some((option) =>
          option.label.endsWith('authSchema.ts')
        )
      ).toBe(false);
      expect(selectedTemplateIds).toEqual(presetTemplateIds);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dedupes duplicate output paths and prefers the initial template ids', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-selection-auth-dedupe-')
    );

    try {
      const selectableTemplates: ScaffoldTemplate[] = [
        {
          id: 'auth-runtime',
          path: 'auth.ts',
          target: 'functions',
          content: 'runtime',
          requires: [],
        },
        {
          id: 'auth-runtime-convex',
          path: 'auth.ts',
          target: 'functions',
          content: 'runtime convex',
          requires: [],
        },
        {
          id: 'auth-client',
          path: 'convex/auth-client.ts',
          target: 'client-lib',
          content: 'client',
          requires: [],
        },
        {
          id: 'auth-client-convex',
          path: 'convex/auth-client.ts',
          target: 'client-lib',
          content: 'client convex',
          requires: [],
        },
      ];
      const initialTemplateIds = ['auth-runtime-convex', 'auth-client-convex'];
      const multiselectPromptStub = mock(
        async <TValue extends string>(params: {
          initialValues?: readonly TValue[];
        }) => params.initialValues ?? []
      );

      const selectedTemplateIds = await promptForScaffoldTemplateSelection(
        {
          multiselect: multiselectPromptStub as any,
        } as any,
        { key: 'auth' } as any,
        selectableTemplates,
        initialTemplateIds,
        createRoots(dir)
      );

      const callArgs = (
        multiselectPromptStub.mock.calls[0] as unknown[]
      )[0] as {
        initialValues: string[];
        options: Array<{ label: string; value: string }>;
      };
      const expectedOptions = [
        {
          label: path
            .relative(
              process.cwd(),
              path.join(dir, 'convex', 'functions', 'auth.ts')
            )
            .replaceAll('\\', '/'),
          value: 'auth-runtime-convex',
        },
        {
          label: path
            .relative(
              process.cwd(),
              path.join(dir, 'convex', 'functions', 'convex', 'auth-client.ts')
            )
            .replaceAll('\\', '/'),
          value: 'auth-client-convex',
        },
      ];

      expect(callArgs.options).toEqual(expectedOptions);
      expect(callArgs.initialValues).toEqual(initialTemplateIds);
      expect(selectedTemplateIds).toEqual(initialTemplateIds);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
