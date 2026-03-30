import { CRPCError } from 'kitcn/server';

// Helper function to check role authorization
export function roleGuard(
  role: 'admin',
  user: { isAdmin?: boolean; role?: string | null } | null
) {
  if (!user) {
    throw new CRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied',
    });
  }
  if (role === 'admin' && !user.isAdmin) {
    throw new CRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }
}
