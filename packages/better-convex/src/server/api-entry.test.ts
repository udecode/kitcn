import { anyApi, getFunctionName } from 'convex/server';
import { getFuncRef } from '../shared/meta-utils';
import { createApiLeaf } from './api-entry';

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
});
