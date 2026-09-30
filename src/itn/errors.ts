/**
 * The ITN server rejected the request signature (HTTP 401): the signature is
 * wrong, or the key's public half is not in the daemon's `--itn-keys`.
 */
export class ItnUnauthorizedError extends Error {
  constructor(readonly queryName: string) {
    super(
      `ITN server rejected the signature of ${queryName} (HTTP 401); is the public key in --itn-keys?`,
    );
    this.name = 'ItnUnauthorizedError';
  }
}

/** The ITN server still rejected the sequence information (HTTP 412) after a new auth. */
export class ItnSequencingError extends Error {
  constructor(readonly queryName: string) {
    super(
      `ITN server rejected the sequence number of ${queryName} again after a new auth (HTTP 412)`,
    );
    this.name = 'ItnSequencingError';
  }
}

/**
 * The daemon answered with an HTTP error status other than 401 and 412. It is
 * the `cause` of a `DaemonConnectionError`, so callers can read the status
 * (for example to tell a node that is unwell from a request no node accepts).
 */
export class ItnHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = 'ItnHttpError';
  }
}

/** An ITN key could not be decoded. */
export class InvalidItnKeyError extends Error {
  constructor(readonly reason: string) {
    super(`invalid ITN key: ${reason}`);
    this.name = 'InvalidItnKeyError';
  }
}
