export class LoadAPIKeyError extends Error {
  constructor({ message }: { message: string }) {
    super(message);

    this.name = 'LoadAPIKeyError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
    };
  }
}
