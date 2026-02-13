import { GatewayError } from './gateway-error';

const name = 'GatewayTimeoutError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Client request timed out before receiving a response.
 */
export class GatewayTimeoutError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'timeout_error';

  constructor({
    message = 'Request timed out',
    statusCode = 408,
    cause,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
  } = {}) {
    super({ message, statusCode, cause });
  }

  static isInstance(error: unknown): error is GatewayTimeoutError {
    return GatewayError.hasMarker(error) && symbol in error;
  }

  /**
   * Creates a helpful timeout error message with troubleshooting guidance
   */
  static createTimeoutError({
    originalMessage,
    statusCode = 408,
    cause,
  }: {
    originalMessage: string;
    statusCode?: number;
    cause?: unknown;
  }): GatewayTimeoutError {
    const message = `Gateway request timed out: ${originalMessage}

    This is a client-side timeout. To resolve this, increase your timeout configuration: https://vercel.com/docs/ai-gateway/capabilities/video-generation#extending-timeouts-for-node.js`;

    return new GatewayTimeoutError({
      message,
      statusCode,
      cause,
    });
  }
}
