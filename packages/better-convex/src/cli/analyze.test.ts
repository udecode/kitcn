import { describe, expect, test, vi } from 'bun:test';
import fs from 'node:fs';
import { __test } from './analyze';

const makeState = (): Parameters<typeof __test.reduceInteractiveState>[0] => ({
  selectedIndex: 0,
  topIndex: 0,
  filterQuery: '',
  sortKey: 'out',
  detailPane: 'packages',
  includeGenerated: false,
  watchEnabled: false,
  showHelp: false,
  statusMessage: '',
});

describe('cli/analyze interactive helpers', () => {
  test('parseArgs uses first positional argument as entry regex', () => {
    const options = __test.parseArgs(['polar.*', '--details']);
    expect(options.entryPattern).toBe('polar.*');
    expect(options.details).toBe(true);
  });

  test('parseArgs rejects removed --top forms', () => {
    expect(() => __test.parseArgs(['--top', '7'])).toThrow(
      '`--top` and `--detail-entries` were removed.'
    );
    expect(() => __test.parseArgs(['--top=9'])).toThrow(
      '`--top` and `--detail-entries` were removed.'
    );
  });

  test('parseArgs rejects removed --hotspot flag', () => {
    expect(() => __test.parseArgs(['--hotspot'])).toThrow(
      '`--hotspot` was removed.'
    );
  });

  test('parseArgs rejects removed --no-interactive flag', () => {
    expect(() => __test.parseArgs(['--no-interactive'])).toThrow(
      '`--no-interactive` was removed.'
    );
    expect(() => __test.parseArgs(['-I'])).toThrow(
      '`--no-interactive` was removed.'
    );
  });

  test('parseArgs rejects --interactive in deploy mode', () => {
    expect(() => __test.parseArgs(['--deploy', '--interactive'])).toThrow(
      '`--interactive` is hotspot-only.'
    );
  });

  test('parseArgs rejects removed --entry flag', () => {
    expect(() => __test.parseArgs(['--entry', 'polar.*'])).toThrow(
      '`--entry` was removed.'
    );
  });

  test('parseArgs rejects removed --detail-entries flag', () => {
    expect(() => __test.parseArgs(['--detail-entries', '5'])).toThrow(
      '`--top` and `--detail-entries` were removed.'
    );
  });

  test('parseArgs rejects multiple positional regex patterns', () => {
    expect(() => __test.parseArgs(['polar.*', 'auth.*'])).toThrow(
      'Only one positional entry regex is allowed.'
    );
  });

  test('native handler export parser detects direct query/mutation/action exports', () => {
    const source = `
export const getUser = query({});
export const createUser = internalMutation({});
`;
    const exports = __test.getNativeHandlerExportNames(source);
    expect(exports).toContain('getUser');
    expect(exports).toContain('createUser');
  });

  test('native handler export parser detects orm.api destructured exports', () => {
    const source = `
export const {
  scheduledMutationBatch,
  scheduledDelete: removeScheduled,
} = orm.api();
`;
    const exports = __test.getNativeHandlerExportNames(source);
    expect(exports).toContain('scheduledMutationBatch');
    expect(exports).toContain('removeScheduled');
  });

  test('native handler export parser detects chained cRPC procedure exports', () => {
    const source = `
export const list = optionalAuthQuery
  .input(z.object({}))
  .query(async ({ ctx }) => ctx.userId);

export const update = authMutation
  .input(z.object({ id: z.string() }))
  .mutation(async ({ input }) => input.id);

export const run = authAction.action(async () => null);
`;
    const exports = __test.getNativeHandlerExportNames(source);
    expect(exports).toContain('list');
    expect(exports).toContain('update');
    expect(exports).toContain('run');
  });

  test('entry pattern filter uses regex and throws on invalid pattern', () => {
    const roots = {
      projectRoot: '/repo',
      functionsRoot: '/repo/convex/functions',
    };
    const entries = [
      '/repo/convex/functions/user.ts',
      '/repo/convex/functions/generated/auth.ts',
    ];

    expect(
      __test.filterEntryPointsByPattern(entries, roots as any, 'generated/.*')
    ).toEqual(['/repo/convex/functions/generated/auth.ts']);

    expect(() =>
      __test.filterEntryPointsByPattern(entries, roots as any, '[')
    ).toThrow('Invalid entry regex');
  });

  test('detectProjectRoots respects convex.json functions path', () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');
    const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((entry) => {
      const normalizedPath = String(entry).replace(/\\/g, '/');
      return (
        normalizedPath === '/repo/convex.json' ||
        normalizedPath === '/repo/custom/convex'
      );
    });
    const readSpy = vi
      .spyOn(fs, 'readFileSync')
      .mockReturnValue('{"functions":"custom/convex"}' as any);

    const roots = __test.detectProjectRoots();

    expect(roots).toEqual({
      projectRoot: '/repo',
      functionsRoot: '/repo/custom/convex',
    });

    cwdSpy.mockRestore();
    existsSpy.mockRestore();
    readSpy.mockRestore();
  });

  test('fitListViewport keeps selected row visible', () => {
    expect(__test.fitListViewport(20, 3, 5, 0)).toBe(0);
    expect(__test.fitListViewport(20, 9, 5, 0)).toBe(5);
    expect(__test.fitListViewport(20, 2, 5, 6)).toBe(2);
    expect(__test.fitListViewport(0, 0, 5, 3)).toBe(0);
  });

  test('sort cycle follows OutMB -> DepMB -> Fns -> OutMB', () => {
    expect(__test.cycleHotspotSort('out')).toBe('dep');
    expect(__test.cycleHotspotSort('dep')).toBe('fns');
    expect(__test.cycleHotspotSort('fns')).toBe('out');
  });

  test('detail pane cycle follows handlers -> packages -> inputs', () => {
    expect(__test.cycleHotspotDetailPane('handlers')).toBe('packages');
    expect(__test.cycleHotspotDetailPane('packages')).toBe('inputs');
    expect(__test.cycleHotspotDetailPane('inputs')).toBe('handlers');
  });

  test('detail pane backward cycle follows handlers <- packages <- inputs', () => {
    expect(__test.cycleHotspotDetailPaneBackward('handlers')).toBe('inputs');
    expect(__test.cycleHotspotDetailPaneBackward('inputs')).toBe('packages');
    expect(__test.cycleHotspotDetailPaneBackward('packages')).toBe('handlers');
  });

  test('pickSelectedIndex preserves preferred entry and clamps fallback', () => {
    const rows = [
      { entry: 'a.ts' },
      { entry: 'b.ts' },
      { entry: 'c.ts' },
    ] as any;

    expect(__test.pickSelectedIndex(rows, 'b.ts', 0)).toBe(1);
    expect(__test.pickSelectedIndex(rows, 'missing.ts', 99)).toBe(2);
    expect(__test.pickSelectedIndex([], 'missing.ts', 99)).toBe(0);
  });

  test('layout threshold is split at >=120 columns, stacked below', () => {
    expect(__test.resolveInteractiveLayout(120, 30).mode).toBe('split');
    expect(__test.resolveInteractiveLayout(119, 30).mode).toBe('stacked');
  });

  test('default hotspot selection includes Convex-ignored entries that export handlers', () => {
    const baseCandidateEntries = ['convex/functions/user.ts'];
    const allCandidateEntries = [
      'convex/functions/user.ts',
      'convex/functions/generated/auth.ts',
      'convex/functions/generated/auth.runtime.ts',
    ];
    const handlerExportsByEntry = new Map<string, string[]>([
      ['convex/functions/user.ts', ['getUser']],
      ['convex/functions/generated/auth.ts', ['findOne']],
    ]);

    const selected = __test.selectHotspotEntryPoints({
      baseCandidateEntries,
      allCandidateEntries,
      handlerExportsByEntry,
      includeGenerated: false,
    });

    expect(selected.entryPoints).toEqual([
      'convex/functions/user.ts',
      'convex/functions/generated/auth.ts',
    ]);
  });

  test('--all hotspot selection includes every Convex-ignored entry', () => {
    const baseCandidateEntries = ['convex/functions/user.ts'];
    const allCandidateEntries = [
      'convex/functions/user.ts',
      'convex/functions/generated/auth.ts',
      'convex/functions/generated/auth.runtime.ts',
    ];
    const handlerExportsByEntry = new Map<string, string[]>([
      ['convex/functions/user.ts', ['getUser']],
      ['convex/functions/generated/auth.ts', ['findOne']],
    ]);

    const selected = __test.selectHotspotEntryPoints({
      baseCandidateEntries,
      allCandidateEntries,
      handlerExportsByEntry,
      includeGenerated: true,
    });

    expect(selected.entryPoints).toEqual([
      'convex/functions/user.ts',
      'convex/functions/generated/auth.ts',
      'convex/functions/generated/auth.runtime.ts',
    ]);
  });

  test('reducer handles key actions', () => {
    let state = makeState();

    state = __test.reduceInteractiveState(state, {
      type: 'moveSelection',
      delta: 2,
      rowCount: 5,
    } as any);
    expect(state.selectedIndex).toBe(2);

    state = __test.reduceInteractiveState(state, {
      type: 'setFilter',
      query: 'user',
    } as any);
    expect(state.filterQuery).toBe('user');

    state = __test.reduceInteractiveState(state, { type: 'cycleSort' } as any);
    expect(state.sortKey).toBe('dep');

    state = __test.reduceInteractiveState(state, {
      type: 'cyclePane',
      direction: 1,
    } as any);
    expect(state.detailPane).toBe('inputs');

    state = __test.reduceInteractiveState(state, {
      type: 'cyclePane',
      direction: -1,
    } as any);
    expect(state.detailPane).toBe('packages');

    state = __test.reduceInteractiveState(state, {
      type: 'toggleGenerated',
    } as any);
    expect(state.includeGenerated).toBe(true);

    state = __test.reduceInteractiveState(state, {
      type: 'requestRefresh',
    } as any);
    expect(state.statusMessage).toBe('Refreshing analysis...');

    state = __test.reduceInteractiveState(state, {
      type: 'toggleWatch',
    } as any);
    expect(state.watchEnabled).toBe(true);

    state = __test.reduceInteractiveState(state, { type: 'toggleHelp' } as any);
    expect(state.showHelp).toBe(true);
  });
});
