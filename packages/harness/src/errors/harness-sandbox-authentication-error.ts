import { AISDKError } from '@ai-sdk/provider';
import { HarnessError } from './harness-error';

const name = 'AI_HarnessSandboxAuthenticationError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Thrown when a sandbox provider cannot authenticate or authorize the
 * operation needed to create or resume a harness sandbox. Providers should
 * preserve the underlying SDK failure as `cause` and supply a message that
 * explains how the consumer can configure credentials.
 */
export class HarnessSandboxAuthenticationError extends HarnessError {
  private readonly [symbol] = true;

  readonly sandboxProviderId: string;

  constructor({
    message,
    sandboxProviderId,
    cause,
  }: {
    message: string;
    sandboxProviderId: string;
    cause?: unknown;
  }) {
    super({ message, cause });
    Object.defineProperty(this, 'name', { value: name });
    this.sandboxProviderId = sandboxProviderId;
  }

  static isInstance(
    error: unknown,
  ): error is HarnessSandboxAuthenticationError {
    return AISDKError.hasMarker(error, marker);
  }
}
