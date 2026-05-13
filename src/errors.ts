export interface GraphQLErrorEntry {
  message: string;
  path?: ReadonlyArray<string | number>;
  extensions?: Record<string, unknown>;
}

export class GraphQLError extends Error {
  constructor(
    readonly errors: ReadonlyArray<GraphQLErrorEntry>,
    readonly queryName: string,
  ) {
    super(`GraphQL error in ${queryName}: ${errors.map((e) => e.message).join('; ')}`);
    this.name = 'GraphQLError';
  }
}

export class DaemonConnectionError extends Error {
  constructor(
    readonly queryName: string,
    readonly retries: number,
    override readonly cause: unknown,
  ) {
    super(
      `failed to execute ${queryName} after ${retries} attempts: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = 'DaemonConnectionError';
  }
}

export class AccountNotFoundError extends Error {
  constructor(readonly publicKey: string) {
    super(`account not found: ${publicKey}`);
    this.name = 'AccountNotFoundError';
  }
}
