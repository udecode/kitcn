import type {
  GetColumnData,
  InferInsertModel,
  InferSelectModel,
} from 'kitcn/orm';
import { convexTable, text } from 'kitcn/orm';
import { type Equal, Expect, IsAny, Not } from './utils';

// ============================================================================
// ColumnBuilder hooks ($type / $defaultFn / $onUpdateFn)
// ============================================================================

// Test 1: $defaultFn / $onUpdateFn make NOT NULL fields optional on insert
{
  const users = convexTable('hook_users', {
    name: text().notNull(),
    createdAtText: text()
      .notNull()
      .$defaultFn(() => 'now'),
    updatedAt: text()
      .notNull()
      .$onUpdateFn(() => 'now'),
  });

  type Insert = InferInsertModel<typeof users>;

  Expect<
    Equal<
      Insert,
      {
        name: string;
        createdAtText?: string | undefined;
        updatedAt?: string | undefined;
      }
    >
  >;
  Expect<Not<IsAny<Insert>>>;
}

// Test 2: $type affects GetColumnData (query/raw)
{
  const status = text().$type<'active' | 'inactive'>();

  type StatusQuery = GetColumnData<typeof status, 'query'>;
  type StatusRaw = GetColumnData<typeof status, 'raw'>;

  Expect<Equal<StatusQuery, 'active' | 'inactive' | null>>;
  Expect<Equal<StatusRaw, 'active' | 'inactive'>>;
  Expect<Not<IsAny<StatusQuery>>>;
  Expect<Not<IsAny<StatusRaw>>>;
}

// Test 3: $type affects InferSelectModel / InferInsertModel
{
  const users = convexTable('typed_users', {
    status: text().$type<'active' | 'inactive'>(),
  });

  type Select = InferSelectModel<typeof users>;
  type Insert = InferInsertModel<typeof users>;

  Expect<Equal<Select['status'], 'active' | 'inactive' | null>>;
  Expect<Equal<Insert['status'], ('active' | 'inactive') | null | undefined>>;
  Expect<Not<IsAny<Select['status']>>>;
  Expect<Not<IsAny<Insert['status']>>>;
}

// Test 4: .default() accepts $type override (Drizzle parity, type-only)
{
  const createdAt = text().$type<Date>().default(new Date());
  type CreatedAt = GetColumnData<typeof createdAt, 'raw'>;

  Expect<Equal<CreatedAt, Date>>;
  Expect<Not<IsAny<CreatedAt>>>;
}

// ============================================================================
// NEGATIVE TYPE TESTS
// ============================================================================

// $defaultFn must return the column data type
{
  text()
    .notNull()
    .$defaultFn(
      // @ts-expect-error - default must return string
      () => 123
    );
}

// $onUpdateFn must return the column data type
{
  text()
    .notNull()
    .$onUpdateFn(
      // @ts-expect-error - onUpdate must return string
      () => 456
    );
}

// $type should constrain default value
{
  text()
    .$type<Date>()
    // @ts-expect-error - default must match $type
    .default('not-a-date');
}
