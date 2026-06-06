import { GatewayError } from './gateway-error';

const name = 'GatewayExplicitCacheFallbackError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * An explicit provider cache reference (e.g. Gemini `cachedContent`) could not
 * be served by fallback credentials and was refused rather than retried
 * without the cached prompt. Retry without the cache reference and include the
 * full inline prompt.
 */
export class GatewayExplicitCacheFallbackError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'gemini_explicit_cache_fallback_unsupported';

  constructor({
    message = 'Explicit cache reference cannot be served by fallback credentials',
    statusCode = 424,
    cause,
    generationId,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
    generationId?: string;
  } = {}) {
    super({ message, statusCode, cause, generationId });
  }

  static isInstance(
    error: unknown,
  ): error is GatewayExplicitCacheFallbackError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
