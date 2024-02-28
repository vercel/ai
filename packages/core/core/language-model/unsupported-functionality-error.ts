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
      `Functionality not supported by the provider. ` +
        `Provider: ${provider}.\n` +
        `Functionality: ${functionality}`,
    );

    this.name = 'UnsupportedFunctionalityError';

    this.provider = provider;
    this.functionality = functionality;
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
