import * as rsc from './index';

describe('rsc public exports', () => {
  test('re-exports expected runtime surfaces', () => {
    expect(typeof rsc.createServerCRPCProxy).toBe('function');
    expect(typeof rsc.getServerQueryClientOptions).toBe('function');
  });
});
