export class UnsupportedFunctionalityAIError extends Error {
  readonly functionality: string;
  readonly provider: string;

  constructor({
    provider,
    functionality,
  }: {
    provider: string;
    functionality: string;
  }) {
    super(
      `'${functionality}' functionality not supported by the '${provider}' provider.`,
    );

    this.name = 'UnsupportedFunctionalityAIError';

    this.provider = provider;
    this.functionality = functionality;
  }

  static isUnsupportedFunctionalityAIError(
    error: unknown,
  ): error is UnsupportedFunctionalityAIError {
    return (
      error instanceof Error &&
      error.name === 'UnsupportedFunctionalityAIError' &&
      typeof (error as UnsupportedFunctionalityAIError).provider === 'string' &&
      typeof (error as UnsupportedFunctionalityAIError).functionality ===
        'string'
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      provider: this.provider,
      functionality: this.functionality,
    };
  }
}
