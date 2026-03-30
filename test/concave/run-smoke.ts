import assert from 'node:assert/strict';
import path from 'node:path';
import { createConcave, SqliteDocStore } from '@concavejs/runtime-bun';
import { ConvexHttpClient } from 'convex/browser';
import type { FunctionReference } from 'convex/server';
import { api as runtimeApi } from './fixture/convex/functions/_generated/api';
import { initCRPC } from './fixture/convex/functions/generated/server';

type SmokeApi = {
  messages: {
    create: FunctionReference<'mutation', 'public'>;
    list: FunctionReference<'query', 'public'>;
  };
};

const FIXTURE_ROOT = path.join(import.meta.dir, 'fixture');
const api = runtimeApi as SmokeApi;

const server = createConcave({
  convexDir: path.join(FIXTURE_ROOT, 'convex'),
  functionsDir: path.join(FIXTURE_ROOT, 'convex', 'functions'),
  schema: 'skip',
  docstore: new SqliteDocStore(':memory:'),
});

await server.listen({
  hostname: '127.0.0.1',
  port: 0,
});

try {
  assert.equal(typeof initCRPC.create, 'function');

  const client = new ConvexHttpClient(server.url, {
    fetch,
  });

  const id = await client.mutation(api.messages.create, {
    body: 'hello concave',
  });

  assert.equal(typeof id, 'string');

  const messages = await client.query(api.messages.list, {});

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.body, 'hello concave');
  assert.equal(messages[0]?._id, id);

  console.log('Concave smoke passed.');
} finally {
  await server.close();
}
