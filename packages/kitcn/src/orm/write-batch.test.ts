import { describe, expect, test } from 'bun:test';
import {
  enqueueOrmWriteBatch,
  flushOrmWriteBatch,
  isOrmWriteBatchOpen,
  runInOrmUserCallback,
  runInOrmWriteBatch,
} from './write-batch';

const ORMLIFECYCLE_INNER_DB = Symbol.for('kitcn:OrmLifecycleInnerDB');

/** Stands in for the writer Convex builds once per function invocation. */
const transaction = () => ({ id: 'raw-writer' });

/** Stands in for a lifecycle wrapper, which is rebuilt per write operation. */
const wrapper = (inner: object) => {
  const wrapped = {};
  Object.defineProperty(wrapped, ORMLIFECYCLE_INNER_DB, {
    configurable: false,
    enumerable: false,
    value: inner,
    writable: false,
  });
  return wrapped;
};

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('runInOrmUserCallback', () => {
  test('flushes before user code and suspends reentrant deferral until a throwing callback settles', async () => {
    const db = transaction();
    let applied = 0;
    await runInOrmWriteBatch(db, async () => {
      enqueueOrmWriteBatch(db, async () => {
        applied += 1;
      });
      await expect(
        runInOrmUserCallback(async () => {
          expect(applied).toBe(1);
          expect(isOrmWriteBatchOpen(db)).toBe(false);
          await runInOrmWriteBatch(db, async () => {
            expect(isOrmWriteBatchOpen(db)).toBe(false);
          });
          throw new Error('callback failed');
        })
      ).rejects.toThrow('callback failed');
      expect(isOrmWriteBatchOpen(db)).toBe(true);
      enqueueOrmWriteBatch(db, async () => {
        applied += 1;
      });
      expect(applied).toBe(1);
    });
    expect(applied).toBe(2);
  });

  test('does not enter user code when its pre-callback flush fails', async () => {
    const db = transaction();
    let called = false;
    await runInOrmWriteBatch(db, async () => {
      enqueueOrmWriteBatch(db, async () => {
        throw new Error('flush failed');
      });
      await expect(
        runInOrmUserCallback(() => {
          called = true;
        })
      ).rejects.toThrow('flush failed');
      expect(called).toBe(false);
      expect(isOrmWriteBatchOpen(db)).toBe(true);
    });
    await runInOrmUserCallback(() => {
      called = true;
    });
    expect(called).toBe(true);
  });
});

describe('runInOrmWriteBatch', () => {
  test('holds queued work until the outermost scope closes', async () => {
    const db = transaction();
    const applied: string[] = [];
    const flush = async () => {
      applied.push('flush');
    };

    await runInOrmWriteBatch(db, async () => {
      enqueueOrmWriteBatch(db, flush);
      await runInOrmWriteBatch(db, async () => {
        enqueueOrmWriteBatch(db, flush);
      });
      // The inner scope closing must not drain the outer scope's queue.
      expect(applied).toEqual([]);
    });

    expect(applied).toEqual(['flush']);
  });

  test('flushes work that landed before a mid-scope throw', async () => {
    const db = transaction();
    const applied: string[] = [];

    await expect(
      runInOrmWriteBatch(db, async () => {
        enqueueOrmWriteBatch(db, async () => {
          applied.push('flush');
        });
        throw new Error('statement failed');
      })
    ).rejects.toThrow('statement failed');

    expect(applied).toEqual(['flush']);
  });

  /**
   * The statement's own failure is the one a caller can act on; a flush that
   * fails because the statement half-ran is the consequence, not the reason.
   */
  test('keeps the statement error when the flush fails too', async () => {
    const db = transaction();

    const caught = await runInOrmWriteBatch(db, async () => {
      enqueueOrmWriteBatch(db, async () => {
        await tick();
        throw new Error('bucket write failed');
      });
      throw new Error('statement failed');
    }).catch((error: Error) => error);

    expect(caught.message).toBe('statement failed');
    expect((caught.cause as Error).message).toBe('bucket write failed');
  });

  test('surfaces a flush failure when the statement itself succeeded', async () => {
    const db = transaction();

    await expect(
      runInOrmWriteBatch(db, async () => {
        enqueueOrmWriteBatch(db, async () => {
          await tick();
          throw new Error('bucket write failed');
        });
      })
    ).rejects.toThrow('bucket write failed');
  });

  test('reports whether a scope is open, through any wrapper of the same db', async () => {
    const db = transaction();
    expect(isOrmWriteBatchOpen(db)).toBe(false);

    await runInOrmWriteBatch(db, async () => {
      expect(isOrmWriteBatchOpen(db)).toBe(true);
      expect(isOrmWriteBatchOpen(wrapper(db))).toBe(true);
    });

    expect(isOrmWriteBatchOpen(db)).toBe(false);
  });

  test('keeps transactions independent', async () => {
    const first = transaction();
    const second = transaction();

    await runInOrmWriteBatch(first, async () => {
      expect(isOrmWriteBatchOpen(second)).toBe(false);
    });
  });
});

describe('flushOrmWriteBatch', () => {
  /**
   * The reason the queue exists. A queued write and a write issued around it
   * would be two absolute read-modify-writes on one document, i.e. a lost
   * update, so the drain has to be the single writer.
   */
  test('never runs two flush callbacks concurrently', async () => {
    const db = transaction();
    let inFlight = 0;
    let maxInFlight = 0;
    const slowFlush = (label: string) => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick();
      order.push(label);
      inFlight -= 1;
    };
    const order: string[] = [];

    enqueueOrmWriteBatch(db, slowFlush('a'));
    enqueueOrmWriteBatch(db, slowFlush('b'));

    await Promise.all([flushOrmWriteBatch(db), flushOrmWriteBatch(db)]);

    expect(maxInFlight).toBe(1);
    expect(order).toEqual(['a', 'b']);
  });

  /**
   * A caller arriving mid-drain must wait for it, not observe a drain in
   * progress and read around it — that is the stale-read half of the same race.
   */
  test('a concurrent flush waits for the drain in flight', async () => {
    const db = transaction();
    const order: string[] = [];

    enqueueOrmWriteBatch(db, async () => {
      await tick();
      order.push('flushed');
    });

    const first = flushOrmWriteBatch(db);
    const second = flushOrmWriteBatch(db).then(() => order.push('second done'));
    await Promise.all([first, second]);

    expect(order).toEqual(['flushed', 'second done']);
  });

  test('applies work enqueued while the drain is running', async () => {
    const db = transaction();
    const applied: string[] = [];

    enqueueOrmWriteBatch(db, async () => {
      await tick();
      applied.push('first');
      enqueueOrmWriteBatch(db, async () => {
        applied.push('second');
      });
    });

    await flushOrmWriteBatch(db);

    expect(applied).toEqual(['first', 'second']);
  });

  test('leaves nothing queued for the next drain', async () => {
    const db = transaction();
    let runs = 0;

    enqueueOrmWriteBatch(db, async () => {
      runs += 1;
    });

    await flushOrmWriteBatch(db);
    await flushOrmWriteBatch(db);

    expect(runs).toBe(1);
  });

  test('surfaces a failing flush to its caller', async () => {
    const db = transaction();

    enqueueOrmWriteBatch(db, async () => {
      await tick();
      throw new Error('bucket write failed');
    });

    await expect(flushOrmWriteBatch(db)).rejects.toThrow('bucket write failed');
    // The failed drain must not leave the queue permanently marked as draining.
    let recovered = false;
    enqueueOrmWriteBatch(db, async () => {
      recovered = true;
    });
    await flushOrmWriteBatch(db);
    expect(recovered).toBe(true);
  });

  test('is a no-op when nothing is queued', async () => {
    await expect(flushOrmWriteBatch(transaction())).resolves.toBeUndefined();
    await expect(flushOrmWriteBatch(undefined)).resolves.toBeUndefined();
  });

  test('a wrapper drains the queue its inner db owns', async () => {
    const db = transaction();
    const applied: string[] = [];

    enqueueOrmWriteBatch(wrapper(db), async () => {
      applied.push('flush');
    });
    await flushOrmWriteBatch(wrapper(wrapper(db)));

    expect(applied).toEqual(['flush']);
  });
});
