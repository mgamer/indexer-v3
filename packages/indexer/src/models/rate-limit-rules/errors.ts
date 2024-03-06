export class BlockedRouteError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, BlockedRouteError.prototype);
  }
}
export class BlockedKeyError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, BlockedKeyError.prototype);
  }
}

export enum BlockedKeyErrorMessages {
  Restricted = "This request was blocked as you have exceeded your included requests. Please upgrade your plan or contact us at support@reservoir.tools for assistance.",
  Blocked = "This request was blocked as an invalid API key was detected. Please check your key has be set correctly or contact us at support@reservoir.tools for assistance.",
}
