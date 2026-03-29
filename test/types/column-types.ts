import { v } from 'convex/values';
import {
  bytes,
  convexTable,
  custom,
  type InferInsertModel,
  type InferSelectModel,
  textEnum,
} from 'kitcn/orm';
import { type Equal, Expect, IsAny, Not } from './utils';

// ============================================================================
// Column type/builder inference tests
// ============================================================================

// Test 1: bytes() maps to ArrayBuffer
{
  const files = convexTable('bytes_files', {
    data: bytes().notNull(),
  });

  type Select = InferSelectModel<typeof files>;
  type Insert = InferInsertModel<typeof files>;

  Expect<Equal<Select['data'], ArrayBuffer>>;
  Expect<Equal<Insert['data'], ArrayBuffer>>;
  Expect<Not<IsAny<Select['data']>>>;
  Expect<Not<IsAny<Insert['data']>>>;
}

// Test 2: custom() preserves validator inference
{
  const configs = convexTable('custom_configs', {
    meta: custom(v.object({ key: v.string() })).notNull(),
  });

  type Select = InferSelectModel<typeof configs>;
  type Insert = InferInsertModel<typeof configs>;

  Expect<Equal<Select['meta'], { key: string }>>;
  Expect<Equal<Insert['meta'], { key: string }>>;
  Expect<Not<IsAny<Select['meta']>>>;
  Expect<Not<IsAny<Insert['meta']>>>;
}

// Test 3: textEnum() infers union of literals
{
  const users = convexTable('enum_users', {
    status: textEnum(['active', 'inactive'] as const).notNull(),
  });

  type Select = InferSelectModel<typeof users>;
  type Insert = InferInsertModel<typeof users>;

  Expect<Equal<Select['status'], 'active' | 'inactive'>>;
  Expect<Equal<Insert['status'], 'active' | 'inactive'>>;
  Expect<Not<IsAny<Select['status']>>>;
  Expect<Not<IsAny<Insert['status']>>>;
}

// ============================================================================
// NEGATIVE TYPE TESTS
// ============================================================================

// textEnum default must be one of the enum values
{
  convexTable('enum_invalid', {
    // @ts-expect-error - default must be one of the enum values
    status: textEnum(['active', 'inactive'] as const).default('pending'),
  });
}

// custom() default must match validator type
{
  convexTable('custom_invalid', {
    // @ts-expect-error - default must match validator type
    meta: custom(v.object({ key: v.string() })).default('nope'),
  });
}

// bytes() default must be ArrayBuffer
{
  convexTable('bytes_invalid', {
    // @ts-expect-error - default must be ArrayBuffer
    data: bytes().default('nope'),
  });
}

export {};
