/**
 * Install Convex-safe polyfills required by Better Auth's HTTP handling.
 * This runs automatically when importing `better-convex/auth/http`.
 */
export function installAuthHttpPolyfills(): void {
  // Convex runtime does not define MessageChannel.
  if (typeof MessageChannel !== 'undefined') {
    return;
  }

  class MockMessagePort {
    onmessage: ((event: MessageEvent) => void) | undefined;
    onmessageerror: ((event: MessageEvent) => void) | undefined;

    addEventListener() {}
    close() {}

    dispatchEvent(_event: Event): boolean {
      return false;
    }

    postMessage(_message: unknown, _transfer: Transferable[] = []) {}
    removeEventListener() {}
    start() {}
  }

  class MockMessageChannel {
    port1: MockMessagePort;
    port2: MockMessagePort;

    constructor() {
      this.port1 = new MockMessagePort();
      this.port2 = new MockMessagePort();
    }
  }

  globalThis.MessageChannel =
    MockMessageChannel as unknown as typeof MessageChannel;
}

installAuthHttpPolyfills();

export { authMiddleware } from '../auth/middleware';
export { registerRoutes } from '../auth/registerRoutes';
