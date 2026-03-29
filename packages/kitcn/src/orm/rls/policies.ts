import { entityKind } from '../builders/column-builder';
import type { FilterExpression } from '../filter-expression';
import type { ConvexTable, ConvexTableWithColumns } from '../table';
import type { RlsRole } from './roles';

export type RlsPolicyToOption =
  | 'public'
  | 'current_role'
  | 'current_user'
  | 'session_user'
  | (string & {})
  | RlsRole
  | RlsPolicyToOption[];

type PolicyExpression<TCtx, TTable> =
  | FilterExpression<boolean>
  | ((
      ctx: TCtx,
      table: TTable
    ) => FilterExpression<boolean> | Promise<FilterExpression<boolean>>);

export interface RlsPolicyConfig<
  TCtx = any,
  TTable = ConvexTableWithColumns<any>,
> {
  as?: 'permissive' | 'restrictive';
  for?: 'all' | 'select' | 'insert' | 'update' | 'delete';
  to?: RlsPolicyToOption;
  using?: PolicyExpression<TCtx, TTable>;
  withCheck?: PolicyExpression<TCtx, TTable>;
}

export class RlsPolicy<TCtx = any, TTable = ConvexTableWithColumns<any>>
  implements RlsPolicyConfig<TCtx, TTable>
{
  static readonly [entityKind]: string = 'RlsPolicy';
  readonly [entityKind]: string = 'RlsPolicy';

  readonly as: RlsPolicyConfig<TCtx, TTable>['as'];
  readonly for: RlsPolicyConfig<TCtx, TTable>['for'];
  readonly to: RlsPolicyConfig<TCtx, TTable>['to'];
  readonly using: RlsPolicyConfig<TCtx, TTable>['using'];
  readonly withCheck: RlsPolicyConfig<TCtx, TTable>['withCheck'];

  /** @internal */
  _linkedTable?: ConvexTable<any>;

  constructor(
    readonly name: string,
    config?: RlsPolicyConfig<TCtx, TTable>
  ) {
    if (config) {
      this.as = config.as;
      this.for = config.for;
      this.to = config.to;
      this.using = config.using;
      this.withCheck = config.withCheck;
    }
  }

  link(table: ConvexTable<any>): this {
    this._linkedTable = table;
    return this;
  }
}
export function rlsPolicy<TCtx = any, TTable = ConvexTableWithColumns<any>>(
  name: string,
  config?: RlsPolicyConfig<TCtx, TTable>
) {
  return new RlsPolicy<TCtx, TTable>(name, config);
}

export function isRlsPolicy(value: unknown): value is RlsPolicy {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { [entityKind]?: string })[entityKind] === 'RlsPolicy'
  );
}
