export type RlsMode = 'enforce' | 'skip';

export type RlsContext = {
  /**
   * Optional mode override. Defaults to "enforce".
   */
  mode?: RlsMode;
  /**
   * Request context passed to policy builders.
   */
  ctx?: unknown;
  /**
   * Optional role resolver for enforcing policy "to" clauses.
   */
  roleResolver?: (ctx: unknown) => string[];
};
