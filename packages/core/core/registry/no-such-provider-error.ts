export class NoSuchProviderError extends Error {
  readonly providerId: string;

  constructor({
    providerId,
    message = `No such provider: ${providerId}`,
  }: {
    providerId: string;
    message?: string;
  }) {
    super(message);

    this.name = 'AI_NoSuchProviderError';

    this.providerId = providerId;
  }

  static isNoSuchProviderError(error: unknown): error is NoSuchProviderError {
    return (
      error instanceof Error &&
      error.name === 'AI_NoSuchProviderError' &&
      typeof (error as NoSuchProviderError).providerId === 'string'
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      providerId: this.providerId,
    };
  }
}
