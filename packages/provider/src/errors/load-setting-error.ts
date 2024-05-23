export class LoadSettingError extends Error {
  constructor({ message }: { message: string }) {
    super(message);

    this.name = 'AI_LoadSettingError';
  }

  static isLoadSettingError(error: unknown): error is LoadSettingError {
    return error instanceof Error && error.name === 'AI_LoadSettingError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
    };
  }
}
