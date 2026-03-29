import { anyApi, getFunctionName } from 'convex/server';
import { getFuncRef } from '../shared/meta-utils';
import { createApiLeaf, getGeneratedValue } from './api-entry';

describe('createApiLeaf', () => {
  it('preserves function name for proxied Convex refs', () => {
    const leaf = createApiLeaf<'query', unknown>(
      (anyApi as any).user.getCurrentUser,
      { auth: 'required', type: 'query' }
    );

    expect(getFunctionName(leaf as any)).toBe('user:getCurrentUser');
    expect(getFunctionName((leaf as any).functionRef)).toBe(
      'user:getCurrentUser'
    );
    expect((leaf as any).type).toBe('query');
    expect((leaf as any).auth).toBe('required');
  });

  it('does not append functionRef as a path segment', () => {
    const leaf = createApiLeaf<'query', unknown>(
      (anyApi as any).projects.listForDropdown,
      { type: 'query' }
    );

    const ref = getFuncRef(
      {
        projects: { listForDropdown: leaf },
      },
      ['projects', 'listForDropdown']
    );

    expect(getFunctionName(ref as any)).toBe('projects:listForDropdown');
  });

  it('resolves generated paths when building a leaf from a root object', () => {
    const leaf = createApiLeaf<'query', unknown>(
      {
        projects: {
          listForDropdown: (anyApi as any).projects.listForDropdown,
        },
      },
      ['projects', 'listForDropdown'],
      { type: 'query', auth: 'required' }
    );

    expect(getFunctionName(leaf as any)).toBe('projects:listForDropdown');
    expect(getFunctionName((leaf as any).functionRef)).toBe(
      'projects:listForDropdown'
    );
    expect((leaf as any).auth).toBe('required');
  });

  it('resolves collapsed generated path keys', () => {
    const generatedServer = {
      aggregateBackfill: (anyApi as any)['generated/server'].aggregateBackfill,
    };

    expect(
      getGeneratedValue(
        {
          'generated/server': generatedServer,
        },
        ['generated', 'server']
      )
    ).toBe(generatedServer);
  });

  it('resolves collapsed generated path keys through proxy access', () => {
    const generatedServer = {
      aggregateBackfill: (anyApi as any)['generated/server'].aggregateBackfill,
    };
    const root = new Proxy(
      {},
      {
        get(_target, property) {
          return property === 'generated/server' ? generatedServer : undefined;
        },
      }
    );

    expect(getGeneratedValue(root, ['generated', 'server'])).toBe(
      generatedServer
    );
  });
});
