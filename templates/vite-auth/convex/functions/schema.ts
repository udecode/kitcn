import { authExtension } from '../lib/plugins/auth/schema';
import { defineSchema } from 'better-convex/orm';

export const tables = {};

export default defineSchema(tables).extend(authExtension());
