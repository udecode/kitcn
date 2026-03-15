export const RATELIMIT_SCHEMA_TEMPLATE = `import {
  convexTable,
  defineSchemaExtension,
  index,
  integer,
  text,
  textEnum,
} from "better-convex/orm";

export const ratelimitStateTable = convexTable(
  "ratelimit_state",
  {
    name: text().notNull(),
    key: text(),
    shard: integer().notNull(),
    value: integer().notNull(),
    ts: integer().notNull(),
    auxValue: integer(),
    auxTs: integer(),
  },
  (t) => [
    index("by_name_key_shard").on(t.name, t.key, t.shard),
    index("by_name_key").on(t.name, t.key),
  ],
);

export const ratelimitDynamicTable = convexTable(
  "ratelimit_dynamic_limit",
  {
    prefix: text().notNull(),
    limit: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [index("by_prefix").on(t.prefix)],
);

export const ratelimitProtectionTable = convexTable(
  "ratelimit_protection_hit",
  {
    prefix: text().notNull(),
    value: text().notNull(),
    kind: textEnum(["identifier", "ip", "userAgent", "country"]).notNull(),
    hits: integer().notNull(),
    blockedUntil: integer(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    index("by_prefix_value_kind").on(t.prefix, t.value, t.kind),
    index("by_prefix").on(t.prefix),
  ],
);

export function ratelimitExtension() {
  return defineSchemaExtension("ratelimit", {
    ratelimitState: ratelimitStateTable,
    ratelimitDynamicLimit: ratelimitDynamicTable,
    ratelimitProtectionHit: ratelimitProtectionTable,
  });
}
`;
