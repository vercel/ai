export class InvalidMessageRoleError extends Error {
  readonly role: string;

  constructor({
    role,
    message = `Invalid message role: '${role}'. Must be one of: "system", "user", "assistant", "tool".`,
  }: {
    role: string;
    message?: string;
  }) {
    super(message);

    this.name = 'AI_InvalidMessageRoleError';

    this.role = role;
  }

  static isInvalidMessageRoleError(
    error: unknown,
  ): error is InvalidMessageRoleError {
    return (
      error instanceof Error &&
      error.name === 'AI_InvalidMessageRoleError' &&
      typeof (error as InvalidMessageRoleError).role === 'string'
    );
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      role: this.role,
    };
  }
}
