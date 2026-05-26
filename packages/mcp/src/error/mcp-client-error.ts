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
  readonly code?: number;

  /**
   * HTTP status code from the failed response, when the error originated
   * from an HTTP transport failure. Undefined for non-HTTP transports
   * (stdio) and for HTTP errors that do not have an associated response
   * status (e.g. network failures, abort).
   */
  readonly statusCode?: number;

  /**
   * URL of the MCP endpoint the failing request was sent to, when the
   * error originated from an HTTP transport failure.
   */
  readonly url?: string;

  /**
   * Body of the failing HTTP response, decoded as text, when available.
   * Undefined when the body could not be read or the error did not have
   * an associated response.
   */
  readonly responseBody?: string;

  constructor({
    name = 'MCPClientError',
    message,
    cause,
    data,
    code,
    statusCode,
    url,
    responseBody,
  }: {
    name?: string;
    message: string;
    cause?: unknown;
    data?: unknown;
    code?: number;
    statusCode?: number;
    url?: string;
    responseBody?: string;
  }) {
    super({ name, message, cause });
    this.data = data;
    this.code = code;
    this.statusCode = statusCode;
    this.url = url;
    this.responseBody = responseBody;
  }

  static isInstance(error: unknown): error is MCPClientError {
    return AISDKError.hasMarker(error, marker);
  }
}
