import { serializeDryRunPlan } from './dry-run';

describe('cli/utils/dry-run', () => {
  test('serializes dependency paths with forward slashes', () => {
    const payload = serializeDryRunPlan({
      plugin: 'resend',
      preset: 'default',
      selectionSource: 'preset',
      presetTemplateIds: [],
      selectedTemplateIds: [],
      files: [],
      operations: [],
      dependencyHints: [],
      envReminders: [],
      docs: {
        localPath: 'www/content/docs/plugins/resend.mdx',
        publicUrl: 'https://better-convex.dev/docs/plugins/resend',
      },
      nextSteps: [],
      dependency: {
        packageName: '@better-convex/resend',
        packageSpec: '@better-convex/resend',
        packageJsonPath: 'apps\\web\\package.json',
        installed: false,
        skipped: true,
        reason: 'already_present',
      },
    } as any);

    expect(payload.dependency.packageJsonPath).toBe('apps/web/package.json');
    expect(payload.dependency.packageSpec).toBe('@better-convex/resend');
  });
});
