import { GatewayError } from './gateway-error';

const name = 'GatewayBillingError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Billing error types returned by AI Gateway:
 * - `customer_verification_required` (403): the team must add a payment
 *   method before free credits can be used.
 * - `insufficient_funds` (402): the team has no positive credit balance.
 * - `quota_for_entity_exceeded` (402): a team, project, API key, or user
 *   budget has reached its limit.
 */
export type GatewayBillingErrorType =
  | 'customer_verification_required'
  | 'insufficient_funds'
  | 'quota_for_entity_exceeded';

/**
 * The request was rejected because of the team's billing state.
 * Retrying will not help until the team takes the action at `actionUrl`.
 */
export class GatewayBillingError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type: GatewayBillingErrorType;

  /**
   * Link to the Vercel dashboard page that resolves the error
   * (for example, adding a payment method or credits), when AI Gateway
   * included one in the error message.
   */
  readonly actionUrl?: string;

  constructor({
    message = 'AI Gateway billing check failed',
    statusCode = 402,
    type = 'insufficient_funds',
    actionUrl,
    cause,
    generationId,
  }: {
    message?: string;
    statusCode?: number;
    type?: GatewayBillingErrorType;
    actionUrl?: string;
    cause?: unknown;
    generationId?: string;
  } = {}) {
    super({ message, statusCode, cause, generationId });
    this.type = type;
    this.actionUrl = actionUrl ?? extractVercelUrl(message);
  }

  static isInstance(error: unknown): error is GatewayBillingError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}

export function isGatewayBillingErrorType(
  type: string | null | undefined,
): type is GatewayBillingErrorType {
  return (
    type === 'customer_verification_required' ||
    type === 'insufficient_funds' ||
    type === 'quota_for_entity_exceeded'
  );
}

function extractVercelUrl(message: string): string | undefined {
  const match = message.match(/https:\/\/vercel\.com\/[^\s"'<>]+/);
  return match?.[0].replace(/[.,;:)]+$/, '');
}
