export class UnsupportedFunctionalityError extends Error {
  readonly functionality: string;

  constructor({ functionality }: { functionality: string }) {
    super(`'${functionality}' functionality not supported.`);

    this.name = 'AI_UnsupportedFunctionalityError';

    this.functionality = functionality;
  }

  static isUnsupportedFunctionalityError(
    error: unknown,
  ): error is UnsupportedFunctionalityError {
    return (
      error instanceof Error &&
      error.name === 'AI_UnsupportedFunctionalityError' &&
      typeof (error as UnsupportedFunctionalityError).functionality === 'string'
    );
  }

  /**
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      functionality: this.functionality,
    };
  }
}
