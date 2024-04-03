export class UnsupportedFunctionalityError extends Error {
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

    this.name = 'AI_UnsupportedFunctionalityError';

    this.provider = provider;
    this.functionality = functionality;
  }

  static isUnsupportedFunctionalityError(
    error: unknown,
  ): error is UnsupportedFunctionalityError {
    return (
      error instanceof Error &&
      error.name === 'AI_UnsupportedFunctionalityError' &&
      typeof (error as UnsupportedFunctionalityError).provider === 'string' &&
      typeof (error as UnsupportedFunctionalityError).functionality === 'string'
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
