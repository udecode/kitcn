import { CRPCError } from 'kitcn/server';
import type { SessionUser } from '../../shared/auth-shared';

export function premiumGuard(user: { plan?: SessionUser['plan'] }) {
  if (!user.plan) {
    throw new CRPCError({
      code: 'PAYMENT_REQUIRED',
      message: 'Premium subscription required',
    });
  }
}
