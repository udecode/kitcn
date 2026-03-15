import fs from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { BetterConvexConfig } from '../config.js';
import {
  FUNCTIONS_DIR_IMPORT_PLACEHOLDER,
  PROJECT_CRPC_IMPORT_PLACEHOLDER,
} from '../scaffold-placeholders.js';
import type { PluginInstallPlanFile } from '../types.js';
import { isContentEquivalent } from '../utils/content-compare.js';

const TS_EXTENSION_RE = /\.ts$/;

export function createPlanFile(params: {
  kind: PluginInstallPlanFile['kind'];
  filePath: string;
  content: string;
  templateId?: string;
  managedBaselineContent?: string;
  createReason: string;
  updateReason: string;
  skipReason: string;
}): PluginInstallPlanFile {
  const normalizedPath = relative(process.cwd(), params.filePath).replaceAll(
    '\\',
    '/'
  );
  const exists = fs.existsSync(params.filePath);
  if (!exists) {
    return {
      kind: params.kind,
      templateId: params.templateId,
      path: normalizedPath,
      action: 'create',
      reason: params.createReason,
      content: params.content,
      managedBaselineContent: params.managedBaselineContent,
    };
  }

  const existingContent = fs.readFileSync(params.filePath, 'utf8');
  if (
    isContentEquivalent({
      filePath: normalizedPath,
      existingContent,
      nextContent: params.content,
    })
  ) {
    return {
      kind: params.kind,
      templateId: params.templateId,
      path: normalizedPath,
      action: 'skip',
      reason: params.skipReason,
      content: params.content,
      existingContent,
      managedBaselineContent: params.managedBaselineContent,
    };
  }

  return {
    kind: params.kind,
    templateId: params.templateId,
    path: normalizedPath,
    action: 'update',
    reason: params.updateReason,
    content: params.content,
    existingContent,
    managedBaselineContent: params.managedBaselineContent,
  };
}

export function getCrpcFilePath(config: BetterConvexConfig): string {
  return resolve(process.cwd(), config.paths.lib, 'crpc.ts');
}

export function getHttpFilePath(functionsDir: string): string {
  return resolve(functionsDir, 'http.ts');
}

export function resolveRelativeImportPath(
  filePath: string,
  targetFilePath: string
): string {
  const relativePath = relative(dirname(filePath), targetFilePath)
    .replaceAll('\\', '/')
    .replace(TS_EXTENSION_RE, '');

  if (relativePath.length === 0 || relativePath === '.') {
    return '.';
  }

  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

export function renderInitTemplateContent(params: {
  template: string;
  filePath: string;
  functionsDir: string;
  crpcFilePath: string;
}): string {
  return params.template
    .replaceAll(
      FUNCTIONS_DIR_IMPORT_PLACEHOLDER,
      resolveRelativeImportPath(params.filePath, params.functionsDir)
    )
    .replaceAll(
      PROJECT_CRPC_IMPORT_PLACEHOLDER,
      resolveRelativeImportPath(params.filePath, params.crpcFilePath)
    );
}
