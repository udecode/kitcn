import { api } from '@convex/api';
import { convexBetterAuth } from 'kitcn/auth/nextjs';

export const { createContext, createCaller, handler } = convexBetterAuth({
  api,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});
