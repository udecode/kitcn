import {
  formatPlanDiff,
  formatPlanSummary,
  formatPlanView,
  resolvePlanPathMatches,
} from './dry-run-formatter';

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const createPlan = () => ({
  plugin: 'resend',
  preset: 'default',
  selectionSource: 'preset',
  presetTemplateIds: ['resend-plugin'],
  selectedTemplateIds: ['resend-plugin'],
  dependencyHints: ['bun add @better-convex/resend'],
  envReminders: [
    {
      key: 'RESEND_API_KEY',
      path: 'convex/.env',
      message: 'Set your Resend API key.',
    },
  ],
  docs: {
    localPath: 'www/content/docs/plugins/resend.mdx',
    publicUrl: 'https://better-convex.dev/docs/plugins/resend',
  },
  nextSteps: ['better-convex codegen'],
  dependency: {
    packageName: '@better-convex/resend',
    installed: false,
    skipped: false,
    reason: 'dry_run',
  },
  operations: [
    {
      kind: 'dependency_install',
      status: 'pending',
      reason: 'Install @better-convex/resend.',
      packageName: '@better-convex/resend',
      command: 'bun add @better-convex/resend',
    },
    {
      kind: 'codegen',
      status: 'pending',
      reason: 'Run codegen after scaffold changes.',
      command: 'better-convex codegen',
    },
  ],
  files: [
    {
      kind: 'scaffold',
      path: 'convex/lib/plugins/resend/schema.ts',
      action: 'update',
      reason: 'Update scaffold file.',
      existingContent: `export const resend = "old";\n`,
      content: `export const resend = "new";\n`,
    },
    {
      kind: 'scaffold',
      path: 'convex/plugins/resend.ts',
      action: 'create',
      reason: 'Create scaffold file.',
      content: 'export const resendPlugin = true;\n',
    },
    {
      kind: 'lockfile',
      path: 'convex/plugins.lock.json',
      action: 'skip',
      reason: 'Lockfile already up to date.',
      existingContent: '{}\n',
      content: '{}\n',
    },
  ],
});

describe('cli/utils/dry-run-formatter', () => {
  test('colorizes dry-run summary when FORCE_COLOR=1', () => {
    const originalForceColor = process.env.FORCE_COLOR;
    const originalNoColor = process.env.NO_COLOR;
    process.env.FORCE_COLOR = '1';
    process.env.NO_COLOR = undefined;

    try {
      const output = formatPlanSummary(createPlan() as any);
      expect(output).toMatch(ANSI_RE);
      expect(output).toContain('use --diff <path> or --view <path>');
    } finally {
      process.env.FORCE_COLOR = originalForceColor;
      process.env.NO_COLOR = originalNoColor;
    }
  });

  test('removes ANSI when NO_COLOR=1', () => {
    const originalForceColor = process.env.FORCE_COLOR;
    const originalNoColor = process.env.NO_COLOR;
    process.env.FORCE_COLOR = undefined;
    process.env.NO_COLOR = '1';

    try {
      const output = formatPlanSummary(createPlan() as any);
      expect(output).not.toMatch(ANSI_RE);
    } finally {
      process.env.FORCE_COLOR = originalForceColor;
      process.env.NO_COLOR = originalNoColor;
    }
  });

  test('matches exact, substring, and suffix paths', () => {
    const plan = createPlan();

    expect(
      resolvePlanPathMatches(
        plan.files as any,
        'convex/lib/plugins/resend/schema.ts'
      )
    ).toHaveLength(1);
    expect(
      resolvePlanPathMatches(plan.files as any, 'plugins/resend')
    ).toHaveLength(2);
    expect(
      resolvePlanPathMatches(plan.files as any, 'resend/schema.ts')
    ).toHaveLength(1);
  });

  test('shows no-match messages for diff and view filters', () => {
    const plan = createPlan();

    expect(formatPlanDiff(plan as any, 'does-not-exist')).toContain(
      'No planned file matching "does-not-exist".'
    );
    expect(formatPlanView(plan as any, 'does-not-exist')).toContain(
      'No planned file matching "does-not-exist".'
    );
  });

  test('focuses diff output on the matched file', () => {
    const output = formatPlanDiff(createPlan() as any, 'schema.ts');
    expect(output).toContain('convex/lib/plugins/resend/schema.ts');
    expect(output).not.toContain('convex/plugins/resend.ts');
  });

  test('shows focused diff output with real unified hunks', () => {
    const plan = createPlan();
    plan.files = [
      {
        kind: 'scaffold',
        path: 'convex/lib/plugins/resend/schema.ts',
        action: 'update',
        reason: 'Update scaffold file.',
        existingContent: 'export function resendWebhook() { return "old"; }\n',
        content: 'export function resendWebhook() { return "new"; }\n',
      },
    ];

    const output = formatPlanDiff(plan as any, 'schema.ts');

    expect(output).toContain('convex/lib/plugins/resend/schema.ts');
    expect(output).toContain('update');
    expect(output).toContain('old');
    expect(output).toContain('new');
    expect(output).toContain('@@');
    expect(output).not.toContain('Operations');
  });

  // test('shows formatting-only message for quote and semicolon differences', () => {
  //   const plan = createPlan();
  //   plan.files = [
  //     {
  //       kind: 'scaffold',
  //       path: 'convex/lib/plugins/resend/plugin.ts',
  //       action: 'update',
  //       reason: 'Update scaffold file.',
  //       existingContent:
  //         "import { getEnv } from '../../get-env'\nexport const resend = true\n",
  //       content:
  //         'import { getEnv } from "../../get-env";\nexport const resend = true;\n',
  //     },
  //   ];

  //   const output = formatPlanDiff(plan as any, 'plugin.ts');

  //   expect(output).toContain('Formatting-only changes');
  //   expect(output).not.toContain('@@');
  // });

  // test('suppresses multiline formatting-only churn but shows real change in same hunk', () => {
  //   const plan = createPlan();
  //   plan.files = [
  //     {
  //       kind: 'scaffold',
  //       path: 'convex/lib/plugins/resend/plugin.ts',
  //       action: 'update',
  //       reason: 'Update scaffold file.',
  //       existingContent: [
  //         '  variants: {',
  //         '    size: {',
  //         '      default:',
  //         '        "h-8 gap-1.5 px-2.5",',
  //         '      lg:',
  //         '        "h-9 gap-1.5 px-2.5",',
  //         '      "icon-lg": "size-10",',
  //         '    },',
  //         '  },',
  //       ].join('\n'),
  //       content: [
  //         '  variants: {',
  //         '    size: {',
  //         '      default: "h-8 gap-1.5 px-2.5",',
  //         '      lg: "h-9 gap-1.5 px-2.5",',
  //         '      "icon-lg": "size-9",',
  //         '    },',
  //         '  },',
  //       ].join('\n'),
  //     },
  //   ];

  //   const output = formatPlanDiff(plan as any, 'plugin.ts');

  //   expect(output).not.toContain('-      default:');
  //   expect(output).not.toContain('-      lg:');
  //   expect(output).toContain('size-10');
  //   expect(output).toContain('size-9');
  // });
});
