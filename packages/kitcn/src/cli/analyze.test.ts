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

describe('cli/analyze hotspot bundle options', () => {
  const projectRoot = '/repo';
  const entryPoints = ['/repo/convex/functions/todos.ts'];

  test('bundles every entry in one build without code splitting', () => {
    const options = __test.createHotspotBuildOptions(
      ['/repo/convex/functions/todos.ts', '/repo/convex/functions/user.ts'],
      projectRoot,
      false
    );

    // Splitting would let shared chunks retain code a lone entry tree-shakes,
    // inflating the per-entry number this mode ranks by. `--deploy` owns that view.
    expect(options.splitting).toBeUndefined();
    expect(options.metafile).toBe(true);
    expect(options.write).toBe(false);
    expect(options.absWorkingDir).toBe(projectRoot);
  });

  test('names each entry output by position so results never key off a path', () => {
    const options = __test.createHotspotBuildOptions(
      ['/repo/convex/functions/todos.ts', '/repo/convex/functions/todos.js'],
      projectRoot,
      false
    );

    // esbuild resolves symlinked sources to their real path in
    // `output.entryPoint`, and `todos.ts` / `todos.js` would collide on one
    // derived output path. Positional names dodge both.
    expect(options.entryPoints).toEqual([
      { in: '/repo/convex/functions/todos.ts', out: 'e0' },
      { in: '/repo/convex/functions/todos.js', out: 'e1' },
    ]);
    expect(options.outdir).toBe('out');
  });

  test('schema fallback toggles the externalizing plugin', () => {
    expect(
      __test.createHotspotBuildOptions(entryPoints, projectRoot, false).plugins
    ).toEqual([]);

    const withFallback = __test.createHotspotBuildOptions(
      entryPoints,
      projectRoot,
      true
    );
    expect(withFallback.plugins?.map((plugin) => plugin.name)).toEqual([
      'schema-external-fallback',
    ]);
  });
});

const TODOS = '/repo/convex/functions/todos.ts';
const USER = '/repo/convex/functions/user.ts';

// One shared metafile: `inputs` is the union across entries and includes a file
// that was parsed but tree-shaken out of every output. Outputs are keyed by the
// positional names `createHotspotBuildOptions` assigns.
const SHARED_META = {
  inputs: {
    'convex/functions/todos.ts': {
      bytes: 1000,
      imports: [
        { path: '../node_modules/shared/index.js' },
        { path: 'convex/lib/dead.ts' },
      ],
    },
    'convex/functions/user.ts': {
      bytes: 500,
      imports: [{ path: '../node_modules/shared/index.js' }],
    },
    '../node_modules/shared/index.js': {
      bytes: 4000,
      imports: [{ path: '../node_modules/only-user/index.js' }],
    },
    '../node_modules/only-user/index.js': { bytes: 250, imports: [] },
    'convex/lib/dead.ts': { bytes: 999_999, imports: [] },
    'convex/lib/weightless.ts': { bytes: 7000, imports: [] },
  },
  outputs: {
    'out/e0.js': {
      bytes: 3200,
      entryPoint: 'convex/functions/todos.ts',
      inputs: {
        'convex/functions/todos.ts': { bytesInOutput: 800 },
        '../node_modules/shared/index.js': { bytesInOutput: 2400 },
        // Linked into the chunk but emits nothing.
        'convex/lib/weightless.ts': { bytesInOutput: 0 },
      },
    },
    'out/e1.js': {
      bytes: 2600,
      entryPoint: 'convex/functions/user.ts',
      inputs: {
        'convex/functions/user.ts': { bytesInOutput: 400 },
        '../node_modules/shared/index.js': { bytesInOutput: 2000 },
        '../node_modules/only-user/index.js': { bytesInOutput: 200 },
      },
    },
  },
} as any;

describe('cli/analyze hotspot build attribution', () => {
  const attribute = (
    entryPoints: string[],
    includeDeepData = false,
    meta: any = SHARED_META
  ) =>
    __test.attributeHotspotBuild({
      entryPoints,
      includeDeepData,
      meta,
      projectRoot: '/repo',
      schemaExternalized: false,
    });

  test('row metrics count only inputs that carry weight in that entry output', () => {
    const todosRow = attribute([TODOS, USER]).get(TODOS);

    expect(todosRow).toMatchObject({
      entry: 'convex/functions/todos.ts',
      // 2 of the 6 parsed inputs, not the whole shared graph.
      inputCount: 2,
      localInputBytes: 1000,
      dependencyInputBytes: 4000,
      outputBytes: 3200,
      schemaExternalized: false,
    });

    // Neither the parsed-but-dropped file nor the emit-nothing file inflates a row.
    expect(
      (todosRow?.localInputBytes ?? 0) + (todosRow?.dependencyInputBytes ?? 0)
    ).toBe(5000);
  });

  test('each entry is attributed from its own output, not the shared union', () => {
    expect(attribute([TODOS, USER]).get(USER)).toMatchObject({
      entry: 'convex/functions/user.ts',
      inputCount: 3,
      localInputBytes: 500,
      dependencyInputBytes: 4250,
      outputBytes: 2600,
    });
  });

  test('entries are paired with outputs by position, not by path', () => {
    // Symlinked sources make `output.entryPoint` unusable as a key, so the
    // stale paths in this metafile must not affect attribution.
    const rows = attribute(['/repo/somewhere/else/a.ts'], false, {
      ...SHARED_META,
      outputs: { 'out/e0.js': SHARED_META.outputs['out/e1.js'] },
    });

    expect(rows.get('/repo/somewhere/else/a.ts')).toMatchObject({
      entry: 'somewhere/else/a.ts',
      outputBytes: 2600,
    });
  });

  test('a missing entry output throws so the caller can retry per entry', () => {
    expect(() =>
      attribute([TODOS, USER, '/repo/convex/functions/gone.ts'])
    ).toThrow('esbuild produced no output for convex/functions/gone.ts.');
  });

  test('the schema-externalized flag is stamped on every row it degrades', () => {
    const rows = __test.attributeHotspotBuild({
      entryPoints: [TODOS],
      includeDeepData: false,
      meta: SHARED_META,
      projectRoot: '/repo',
      schemaExternalized: true,
    });

    expect(rows.get(TODOS)?.schemaExternalized).toBe(true);
  });

  test('deep data is omitted unless requested', () => {
    expect(attribute([TODOS]).get(TODOS)?.deep).toBeUndefined();
  });

  test('deep inputs are ranked by bytes in output and keep source bytes', () => {
    const row = attribute([TODOS, USER], true).get(TODOS);

    expect(row?.deep?.outputInputs).toEqual([
      {
        path: '../node_modules/shared/index.js',
        bytesInOutput: 2400,
        sourceBytes: 4000,
      },
      {
        path: 'convex/functions/todos.ts',
        bytesInOutput: 800,
        sourceBytes: 1000,
      },
      {
        path: 'convex/lib/weightless.ts',
        bytesInOutput: 0,
        sourceBytes: 7000,
      },
    ]);
  });

  test('deep import graph is scoped to the inputs that entry actually bundles', () => {
    const rows = attribute([TODOS, USER], true);

    // `dead.ts` is imported in source but reaches no output, so it is not an edge.
    expect(rows.get(TODOS)?.deep?.importsByInput).toEqual({
      'convex/functions/todos.ts': ['../node_modules/shared/index.js'],
      '../node_modules/shared/index.js': [],
      'convex/lib/weightless.ts': [],
    });

    // Same shared input, different edges: `only-user` is bundled only by `user`.
    expect(rows.get(USER)?.deep?.importsByInput).toEqual({
      'convex/functions/user.ts': ['../node_modules/shared/index.js'],
      '../node_modules/shared/index.js': ['../node_modules/only-user/index.js'],
      '../node_modules/only-user/index.js': [],
    });
  });
});

describe('cli/analyze hotspot sweep', () => {
  const sweep = (entryPoints: string[], build: any) =>
    __test.sweepHotspotEntries(entryPoints, '/repo', false, build);

  const okBuild =
    (schemaExternalized = false) =>
    async (entryPoints: string[]) => ({
      result: {
        metafile: {
          ...SHARED_META,
          outputs: Object.fromEntries(
            entryPoints.map((_, index) => [
              `out/e${index}.js`,
              SHARED_META.outputs[`out/e${index === 0 ? 0 : 1}.js`],
            ])
          ),
        },
      },
      schemaExternalized,
    });

  test('an empty selection never reaches the bundler', async () => {
    let calls = 0;
    const result = await sweep([], async () => {
      calls += 1;
      throw new Error('should not build');
    });

    expect(calls).toBe(0);
    expect(result.rowsByEntry.size).toBe(0);
    expect(result.failedRows).toEqual([]);
    expect(result.fallbackReason).toBeNull();
  });

  test('the shared pass runs exactly one build and reports no fallback', async () => {
    const calls: string[][] = [];
    const result = await sweep([TODOS, USER], async (entryPoints: string[]) => {
      calls.push(entryPoints);
      return okBuild()(entryPoints);
    });

    expect(calls).toEqual([[TODOS, USER]]);
    expect(result.rowsByEntry.size).toBe(2);
    expect(result.fallbackReason).toBeNull();
  });

  test('a failed shared pass falls back to per-entry builds and names the reason', async () => {
    const calls: string[][] = [];
    const result = await sweep([TODOS, USER], async (entryPoints: string[]) => {
      calls.push(entryPoints);
      if (entryPoints.length > 1) {
        throw new Error('Build failed with 1 error:\nsomething broke');
      }
      return okBuild()(entryPoints);
    });

    expect(calls).toEqual([[TODOS, USER], [TODOS], [USER]]);
    expect(result.rowsByEntry.size).toBe(2);
    expect(result.failedRows).toEqual([]);
    expect(result.fallbackReason).toBe('Build failed with 1 error:');
  });

  test('only the entries that cannot build become failed rows', async () => {
    const result = await sweep([TODOS, USER], async (entryPoints: string[]) => {
      if (entryPoints.length > 1 || entryPoints[0] === USER) {
        throw new Error('cannot resolve ./missing');
      }
      return okBuild()(entryPoints);
    });

    expect([...result.rowsByEntry.keys()]).toEqual([TODOS]);
    expect(result.failedRows).toEqual([
      { entry: 'convex/functions/user.ts', error: 'cannot resolve ./missing' },
    ]);
  });

  test('the shared pass refuses the schema fallback, the per-entry sweep allows it', async () => {
    const allowed: boolean[] = [];
    await sweep(
      [TODOS, USER],
      async (
        entryPoints: string[],
        _root: string,
        allowSchemaFallback: boolean
      ) => {
        allowed.push(allowSchemaFallback);
        if (entryPoints.length > 1) {
          throw new Error('No matching export in schema.ts');
        }
        return okBuild(true)(entryPoints);
      }
    );

    // Externalizing schema across the shared bundle would shrink every entry
    // that imports it, so only the per-entry rebuild may do it.
    expect(allowed).toEqual([false, true, true]);
  });

  test('the schema fallback marks only the rows it degraded', async () => {
    const result = await sweep([TODOS, USER], async (entryPoints: string[]) => {
      if (entryPoints.length > 1) {
        throw new Error('No matching export in schema.ts');
      }
      return okBuild(entryPoints[0] === USER)(entryPoints);
    });

    expect(result.rowsByEntry.get(TODOS)?.schemaExternalized).toBe(false);
    expect(result.rowsByEntry.get(USER)?.schemaExternalized).toBe(true);
  });
});

describe('cli/analyze entry sweep concurrency', () => {
  test('mapWithConcurrency keeps results in input order', async () => {
    const items = [50, 5, 30, 1, 20, 0, 40];
    const results = await __test.mapWithConcurrency(
      items,
      4,
      async (item: number) => {
        await new Promise((done) => setTimeout(done, item));
        return item * 2;
      }
    );

    expect(results).toEqual(items.map((item) => item * 2));
  });

  test('mapWithConcurrency runs entries in parallel up to the cap', async () => {
    let inFlight = 0;
    let peak = 0;
    const startedAt = Date.now();

    await __test.mapWithConcurrency(
      Array.from({ length: 12 }, (_, index) => index),
      4,
      async (item: number) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((done) => setTimeout(done, 20));
        inFlight -= 1;
        return item;
      }
    );

    // Serial execution would peak at 1 and take ~240ms.
    expect(peak).toBe(4);
    expect(Date.now() - startedAt).toBeLessThan(200);
  });

  test('mapWithConcurrency handles empty input and cap larger than input', async () => {
    expect(await __test.mapWithConcurrency([], 8, async () => 1)).toEqual([]);
    expect(
      await __test.mapWithConcurrency([1, 2], 99, async (item: number) => item)
    ).toEqual([1, 2]);
  });

  test('resolveAnalyzeConcurrency stays bounded', () => {
    expect(__test.resolveAnalyzeConcurrency(0)).toBe(1);
    expect(__test.resolveAnalyzeConcurrency(1)).toBe(1);
    expect(__test.resolveAnalyzeConcurrency(2)).toBeLessThanOrEqual(2);
    const many = __test.resolveAnalyzeConcurrency(200);
    expect(many).toBeGreaterThanOrEqual(1);
    expect(many).toBeLessThanOrEqual(8);
  });
});
