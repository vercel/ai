export class NoSuchProviderError extends Error {
  readonly providerId: string;
  readonly availableProviders: string[];

  constructor({
    providerId,
    availableProviders,
    message = `No such provider: ${providerId} (available providers: ${availableProviders.join()})`,
  }: {
    providerId: string;
    availableProviders: string[];
    message?: string;
  }) {
    super(message);

    this.name = 'AI_NoSuchProviderError';

    this.providerId = providerId;
    this.availableProviders = availableProviders;
  }

  static isNoSuchProviderError(error: unknown): error is NoSuchProviderError {
    return (
      error instanceof Error &&
      error.name === 'AI_NoSuchProviderError' &&
      typeof (error as NoSuchProviderError).providerId === 'string' &&
      Array.isArray((error as NoSuchProviderError).availableProviders)
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      providerId: this.providerId,
      availableProviders: this.availableProviders,
    };
  }
}
