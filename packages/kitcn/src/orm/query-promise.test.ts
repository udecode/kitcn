import { QueryPromise } from './query-promise';

class TestQueryPromise<T> extends QueryPromise<T> {
  constructor(private readonly run: () => Promise<T>) {
    super();
  }

  execute(): Promise<T> {
    return this.run();
  }
}

describe('QueryPromise', () => {
  test('then delegates to execute lazily', async () => {
    let calls = 0;
    const query = new TestQueryPromise(async () => {
      calls += 1;
      return 'ok';
    });

    expect(calls).toBe(0);
    const value = await query.then((result) => result.toUpperCase());
    expect(value).toBe('OK');
    expect(calls).toBe(1);
  });

  test('catch delegates to execute', async () => {
    let calls = 0;
    const query = new TestQueryPromise<string>(async () => {
      calls += 1;
      throw new Error('boom');
    });

    const recovered = await query.catch((error) => `handled:${error.message}`);
    expect(recovered).toBe('handled:boom');
    expect(calls).toBe(1);
  });

  test('finally delegates to execute', async () => {
    let calls = 0;
    let finalized = 0;
    const query = new TestQueryPromise(async () => {
      calls += 1;
      return 42;
    });

    const value = await query.finally(() => {
      finalized += 1;
    });

    expect(value).toBe(42);
    expect(calls).toBe(1);
    expect(finalized).toBe(1);
    expect(Object.prototype.toString.call(query)).toBe('[object QueryPromise]');
  });
});
