/**
 * RLS Type Tests
 *
 * Verifies rlsPolicy/rlsRole types and convexTable.withRLS surface.
 */

import { convexTable, eq, rlsPolicy, rlsRole, text } from 'kitcn/orm';
import { type Equal, Expect } from './utils';

const users = convexTable.withRLS('users', {
  name: text().notNull(),
});

// rlsRole config + existing
{
  const admin = rlsRole('admin', {
    createRole: true,
    createDb: true,
    inherit: true,
  }).existing();

  type RoleName = typeof admin.name;
  Expect<Equal<RoleName, string>>;
}

// rlsPolicy config types and ctx-aware expressions
{
  const admin = rlsRole('admin');
  const policy = rlsPolicy<{ viewerId: string }, typeof users>('owner_policy', {
    as: 'permissive',
    for: 'select',
    to: [admin, 'public'],
    using: (ctx, t) => eq(t.name, ctx.viewerId),
    withCheck: (ctx, t) => eq(t.name, ctx.viewerId),
  });

  type PolicyName = typeof policy.name;
  Expect<Equal<PolicyName, string>>;
}

// rlsPolicy.link(table)
{
  const linked = rlsPolicy('linked').link(users);
  type LinkedName = typeof linked.name;
  Expect<Equal<LinkedName, string>>;
}
