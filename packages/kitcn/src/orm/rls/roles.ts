import { entityKind } from '../builders/column-builder';

export interface RlsRoleConfig {
  createDb?: boolean;
  createRole?: boolean;
  inherit?: boolean;
}

export class RlsRole implements RlsRoleConfig {
  static readonly [entityKind]: string = 'RlsRole';
  readonly [entityKind]: string = 'RlsRole';

  /** @internal */
  _existing?: boolean;

  /** @internal */
  readonly createDb: RlsRoleConfig['createDb'];
  /** @internal */
  readonly createRole: RlsRoleConfig['createRole'];
  /** @internal */
  readonly inherit: RlsRoleConfig['inherit'];

  constructor(
    readonly name: string,
    config?: RlsRoleConfig
  ) {
    if (config) {
      this.createDb = config.createDb;
      this.createRole = config.createRole;
      this.inherit = config.inherit;
    }
  }

  existing(): this {
    this._existing = true;
    return this;
  }
}

export function rlsRole(name: string, config?: RlsRoleConfig) {
  return new RlsRole(name, config);
}

export function isRlsRole(value: unknown): value is RlsRole {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { [entityKind]?: string })[entityKind] === 'RlsRole'
  );
}
