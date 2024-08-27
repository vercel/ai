import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_InvalidMessageRoleError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class InvalidMessageRoleError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly role: string;

  constructor({
    role,
    message = `Invalid message role: '${role}'. Must be one of: "system", "user", "assistant", "tool".`,
  }: {
    role: string;
    message?: string;
  }) {
    super({ name, message });

    this.role = role;
  }

  static isInstance(error: unknown): error is InvalidMessageRoleError {
    return AISDKError.hasMarker(error, marker);
  }

  /**
   * @deprecated use `isInstance` instead
   */
  static isInvalidMessageRoleError(
    error: unknown,
  ): error is InvalidMessageRoleError {
    return (
      error instanceof Error &&
      error.name === name &&
      typeof (error as InvalidMessageRoleError).role === 'string'
    );
  }

  /**
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,

      role: this.role,
    };
  }
}
