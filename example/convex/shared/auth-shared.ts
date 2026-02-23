import { createAccessControl } from 'better-auth/plugins/access';
import {
  defaultStatements,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access';
import type { getAuth } from '../functions/generated/auth';
import type { Select } from './api';

export type Auth = ReturnType<typeof getAuth>;

export type SessionUser = Select<'user'> & {
  activeOrganization:
    | (Select<'organization'> & {
        role: Select<'member'>['role'];
      })
    | null;
  isAdmin: boolean;
  session: Select<'session'>;
  impersonatedBy?: string | null;
  plan?: 'premium' | 'team';
};

export const ac = createAccessControl({
  ...defaultStatements,
  projects: ['create', 'update', 'delete'],
});

const member = ac.newRole({
  ...memberAc.statements,
  projects: ['create', 'update'],
});

const owner = ac.newRole({
  ...ownerAc.statements,
  projects: ['create', 'update', 'delete'],
});

export const roles = { member, owner };
