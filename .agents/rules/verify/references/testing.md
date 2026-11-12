# Testing

This reference holds kitcn's test law for Bun and React: test shape, mocking,
suite contamination and flaky failures. The `verify` skill owns which proof a
claim needs. Use `pstack:tdd` for the red, green and refactor loop.

## Runners

`bun run test` runs both runners in order.

- `bun test` runs every `*.test.ts` under `./packages` (`root` in
  `bunfig.toml`). Its preload, `tooling/test-setup.ts`, registers happy-dom,
  makes `mock` and `spyOn` global, adds the Testing Library matchers and runs
  `cleanup()` after each test. `tooling/global.d.ts` types those globals.
- `vitest run` (`vitest.config.mts`) runs the `integration` project
  (`convex/**/*.test.ts`, `packages/**/*.vitest.ts`, and the type tests in
  `packages/**/*.test-d.ts`) and the `solid` project
  (`packages/kitcn/src/solid/**/*.vitest.{ts,tsx}`).

Run the narrowest file first:

```bash
bun test packages/kitcn/src/react/use-thing.test.ts
bunx vitest run convex/orm/some.test.ts
bun test --bail
bun test --coverage
```

A test must pass both alone and in the full suite.

## Globals

`describe`, `it`, `expect`, `mock`, `spyOn`, `beforeEach` and `afterEach` are
global in Bun tests. Do not import them from `bun:test`. Use Bun's `mock()`,
never `jest.fn()` or `jest.Mock`.

Type mock and spy variables from the functions that create them:

```typescript
let fetchData: ReturnType<typeof mock>;
let fetchDataSpy: ReturnType<typeof spyOn>;
```

## Mocking without contamination

`mock.module()` is process-global. A `mock.module('@/lib/api')` in one test file
changes that module for every later file in the same Bun process. It can also
keep the real exports it does not override, so the module looks real while a
few exports are poisoned.

Mock with a file-scoped spy instead:

1. Import the module as a namespace, `import * as apiModule from '@/lib/api'`,
   because a named import cannot be spied on.
2. Create the spy in `beforeEach` with `spyOn(apiModule, 'fetchData')`.
3. Set its default result in `beforeEach`.
4. Restore it in `afterEach` with `fetchDataSpy.mockRestore()`.
5. Assert on the mock variable, `expect(fetchData)`, not on
   `apiModule.fetchData`.

```typescript
import { act, renderHook } from '@testing-library/react';
import * as apiModule from '@/lib/api';

describe('useThing', () => {
  let fetchData: ReturnType<typeof mock>;
  let fetchDataSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchData = mock();
    fetchDataSpy = spyOn(apiModule, 'fetchData').mockImplementation(fetchData);
    fetchData.mockResolvedValue({ data: 'test' });
  });

  afterEach(() => {
    fetchDataSpy.mockRestore();
  });

  it('fetches data', async () => {
    const { result } = renderHook(() => useThing());

    await act(async () => {
      await result.current.fetch();
    });

    expect(fetchData).toHaveBeenCalled();
  });
});
```

Use `mock.module()` only for infrastructure every test needs, set in a preload,
or for a module that no other code in the same Bun process imports for real.

Do not fix one contaminated test by lowering global concurrency, changing CI or
adding runtime dependency-indirection files that exist only for tests. Prefer a
lower-level contract, a file-scoped spy or a different integration test.

`mockReset()` clears both the call history and the implementation. Set the
default again right after it:

```typescript
const fetchValue = mock(async () => 'default');

beforeEach(() => {
  fetchValue.mockReset();
  fetchValue.mockResolvedValue('default');
});
```

Use `mockClear()` when only the call history should reset.

## Module-scope environment values

A subject that reads an environment flag at module scope keeps the value it
read at import. Changing the mock after a static import cannot reach it. Set a
mutable environment mock first, then import the subject dynamically. Add a
cache-busting import query only when Bun would otherwise reuse the module, and
make it deterministic, such as an incrementing case id, never a random key in a
committed test.

## React hooks

Render a hook with `renderHook()` and wrap every state change in `act()`.

```typescript
it('updates state', async () => {
  const { result } = renderHook(() => useThing());

  await act(async () => {
    await result.current.fetchData();
  });

  expect(result.current.data).toEqual(expectedData);
  expect(result.current.loading).toBe(false);
});
```

Prefix a synchronous `act()` around a click or change event with `void`, as in
`void act(() => getByText('button').click())`, so no unused-promise warning
fires.

For a hook that needs a context provider, pass a wrapper:

```typescript
const createWrapper = (props) => ({ children }) => (
  <Provider {...props}>{children}</Provider>
);

const { result } = renderHook(() => useThing(), {
  wrapper: createWrapper({ value: 'test' }),
});
```

For an async error, make the mock reject, run the call inside `act()`, then
assert the error state the hook exposes:

```typescript
it('handles async errors', async () => {
  fetchData.mockRejectedValue(new Error('Network error'));
  const { result } = renderHook(() => useThing());

  await act(async () => {
    try {
      await result.current.fetchData();
    } catch (error) {
      expect(error).toEqual(new Error('Failed to load'));
    }
  });

  expect(result.current.error).toBe('Failed to load');
});
```

## Matchers

- `toEqual()` checks the whole structure. Use it for a single object.
- `toMatchObject()` on an array checks that each item has the listed
  properties and allows extra ones. Do not use it on a single object, because
  it misses extra properties there.
- When types do not line up, cast the actual value, `expect(node as any)`,
  never the expected value.

## Debugging failures

**A test passes alone and fails in the suite.** Another file contaminates it,
usually through `mock.module()`. Run the likely contaminator before the victim
in one command, and record the smallest order that fails:

```bash
bun test likely-contaminator.test.ts victim.test.ts
```

Inspect module keys, the types of critical functions and resolved default
values behind a temporary opt-in debug flag. Search for `mock.module()` calls
and move them to the spy pattern. Remove the debug output once the owner is
proven.

**"Expected to be called but it was not called".** The spy targets the wrong
function name, or the assertion reads the module function instead of the mock
variable.

**"Hook timed out after 5000ms".** An async operation is not awaited, or a mock
returns a promise that never resolves. Await every async step and give mocks a
resolved value with `mockResolvedValue()`. Raise the timeout, as in
`it('name', fn, 10000)`, only when the work is slow by design.

These signs mean contamination risk. Fix each with the spy pattern:

- `mock.module()` outside a preload;
- a direct named import where a spy is needed;
- a spy with no `mockRestore()` in `afterEach`;
- a test that passes alone and fails in the suite.

## Checklist for a new hook test file

- No imports from `bun:test`.
- `renderHook` and `act` come from `@testing-library/react`.
- Spied modules are imported as namespaces.
- Mock and spy variables are typed with `ReturnType<typeof mock>` and
  `ReturnType<typeof spyOn>`.
- Spies and their default results are set in `beforeEach`.
- Every spy is restored in `afterEach` with `mockRestore()`.
- Every React state change runs inside `act()`.
- Assertions read mock variables, not module functions.
- The file passes alone and in the full suite.
