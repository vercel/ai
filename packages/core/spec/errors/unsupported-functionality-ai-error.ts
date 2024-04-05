export class UnsupportedFunctionalityAIError extends Error {
  readonly functionality: string;

  constructor({ functionality }: { functionality: string }) {
    super(`'${functionality}' functionality not supported.`);

    this.name = 'UnsupportedFunctionalityAIError';

    this.functionality = functionality;
  }

  static isUnsupportedFunctionalityAIError(
    error: unknown,
  ): error is UnsupportedFunctionalityAIError {
    return (
      error instanceof Error &&
      error.name === 'UnsupportedFunctionalityAIError' &&
      typeof (error as UnsupportedFunctionalityAIError).functionality ===
        'string'
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      functionality: this.functionality,
    };
  }
}
