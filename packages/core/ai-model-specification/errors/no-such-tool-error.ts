export class NoSuchToolError extends Error {
  readonly toolName: string;

  constructor({ message, toolName }: { message: string; toolName: string }) {
    super(message);

    this.name = 'AI_NoSuchToolError';

    this.toolName = toolName;
  }

  static isNoSuchToolError(error: unknown): error is NoSuchToolError {
    return (
      error instanceof Error &&
      error.name === 'AI_NoSuchToolError' &&
      typeof (error as NoSuchToolError).toolName === 'string'
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      toolName: this.toolName,
    };
  }
}
