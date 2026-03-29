import { renderInitNextMessagesTemplate } from './init-next-messages.template';

describe('init-next-messages.template', () => {
  test('uses convex/functions-relative cRPC import for scaffolded function roots', () => {
    expect(renderInitNextMessagesTemplate('convex/functions')).toContain(
      "import { publicMutation, publicQuery } from '../lib/crpc';"
    );
  });

  test('uses convex-root-relative cRPC import for legacy convex roots', () => {
    expect(renderInitNextMessagesTemplate('convex')).toContain(
      "import { publicMutation, publicQuery } from './lib/crpc';"
    );
  });
});
