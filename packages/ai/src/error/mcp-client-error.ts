import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_MCPClientError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * An error occurred with the MCP client.
 */
export class MCPClientError extends AISDKError {
  private readonly [symbol] = true;
  readonly data?: unknown;

  constructor({
    name = 'MCPClientError',
    message,
    cause,
    data,
  }: {
    name?: string;
    message: string;
    cause?: unknown;
    data?: unknown;
  }) {
    super({ name, message, cause });
    this.data = data;
  }

  static isInstance(error: unknown): error is MCPClientError {
    return AISDKError.hasMarker(error, marker);
  }
}
