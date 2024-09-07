/**
 * Symbol used for identifying AI SDK Error instances.
 * Enables checking if an error is an instance of AISDKError across package versions.
 */
const marker = 'vercel.ai.error';
const symbol = Symbol.for(marker);

/**
 * Custom error class for AI SDK related errors.
 * @extends Error
 */
export class AISDKError extends Error {
  private readonly [symbol] = true; // used in isInstance

  /**
   * The underlying cause of the error, if any.
   */
  readonly cause?: unknown;

  /**
   * The provider that caused the error.
   *
   * Writable so it can be set by the AI SDK function on AI SDK errors
   * that are thrown by providers.
   */
  provider?: string;

  /**
   * Creates an AI SDK Error.
   *
   * @param {Object} params - The parameters for creating the error.
   * @param {string} params.name - The name of the error.
   * @param {string} params.message - The error message.
   * @param {unknown} [params.cause] - The underlying cause of the error.
   */
  constructor({
    name,
    message,
    cause,
  }: {
    name: string;
    message: string;
    cause?: unknown;
  }) {
    super(message);

    this.name = name;
    this.cause = cause;
  }

  get message(): string {
    return this.provider != null
      ? `${this.provider} provider error: ${super.message}`
      : super.message;
  }

  /**
   * Checks if the given error is an AI SDK Error.
   * @param {unknown} error - The error to check.
   * @returns {boolean} True if the error is an AI SDK Error, false otherwise.
   */
  static isInstance(error: unknown): error is AISDKError {
    return AISDKError.hasMarker(error, marker);
  }

  protected static hasMarker(error: unknown, marker: string): boolean {
    const markerSymbol = Symbol.for(marker);
    return (
      error != null &&
      typeof error === 'object' &&
      markerSymbol in error &&
      typeof error[markerSymbol] === 'boolean' &&
      error[markerSymbol] === true
    );
  }

  /**
   * Returns a JSON representation of the error.
   * @returns {Object} An object containing the error's name, message, and cause.
   *
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
    };
  }
}
