export class EphemeralBlockCache {
  constructor(private readonly cache: Map<string, number>) {}

  isBlocked(identifier: string): { blocked: boolean; reset: number } {
    const reset = this.cache.get(identifier);
    if (!reset) {
      return { blocked: false, reset: 0 };
    }
    if (reset <= Date.now()) {
      this.cache.delete(identifier);
      return { blocked: false, reset: 0 };
    }
    return { blocked: true, reset };
  }

  blockUntil(identifier: string, reset: number): void {
    this.cache.set(identifier, reset);
  }

  clear(identifier: string): void {
    this.cache.delete(identifier);
  }

  size(): number {
    return this.cache.size;
  }
}

export type ReadDedupeCache<T> = {
  get: (key: string) => Promise<T | null> | undefined;
  set: (key: string, value: Promise<T | null>) => void;
  delete: (key: string) => void;
  clear: () => void;
};

export function createReadDedupeCache<T>(): ReadDedupeCache<T> {
  const cache = new Map<string, Promise<T | null>>();

  return {
    get: (key) => cache.get(key),
    set: (key, value) => cache.set(key, value),
    delete: (key) => cache.delete(key),
    clear: () => cache.clear(),
  };
}
