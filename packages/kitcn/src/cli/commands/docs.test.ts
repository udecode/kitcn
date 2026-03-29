import { createDefaultConfig } from '../test-utils';
import {
  DOCS_HELP_TEXT,
  formatDocsOutput,
  handleDocsCommand,
  parseDocsCommandArgs,
} from './docs';

describe('cli/commands/docs', () => {
  test('parseDocsCommandArgs collects topics and json flag', () => {
    expect(parseDocsCommandArgs(['resend', 'cli', '--json'])).toEqual({
      json: true,
      topics: ['resend', 'cli'],
    });
  });

  test('formatDocsOutput aligns local and public links', () => {
    const output = formatDocsOutput([
      {
        topic: 'resend',
        title: 'Resend',
        localPath: 'www/content/docs/plugins/resend.mdx',
        publicUrl: 'https://kitcn.dev/docs/plugins/resend',
      },
    ]);

    expect(output).toContain('kitcn docs');
    expect(output).toContain('local');
    expect(output).toContain('public');
  });

  test('handleDocsCommand(--help) prints docs help', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    try {
      const exitCode = await handleDocsCommand(['docs', '--help'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(infoLines.join('\n')).toContain(DOCS_HELP_TEXT);
    } finally {
      console.info = originalInfo;
    }
  });
});
