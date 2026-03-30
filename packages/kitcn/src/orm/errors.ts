export class OrmNotFoundError extends Error {
  constructor(
    message: string,
    readonly table?: string
  ) {
    super(message);
    this.name = 'OrmNotFoundError';
  }
}
