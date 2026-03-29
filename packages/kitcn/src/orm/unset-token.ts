// Explicit sentinel for "remove this field" semantics in Convex patch/update.
//
// Why: `undefined` is overloaded in Convex (`ctx.db.patch({ a: undefined })` unsets),
// but in Drizzle/Prisma-style builders we want `undefined` to mean "not provided".
//
// `unsetToken` is never persisted; builders translate it to a top-level `undefined`
// in the patch payload right before calling `db.patch(...)`.
export const unsetToken = Symbol.for('kitcn/orm/unsetToken');
export type UnsetToken = typeof unsetToken;

export function isUnsetToken(value: unknown): value is UnsetToken {
  return value === unsetToken;
}
