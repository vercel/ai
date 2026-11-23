import { AISDKError } from './ai-sdk-error';

const name = 'AI_ExtractionRefusalError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * An extraction model declined to extract one or more fields.
 */
export class ExtractionRefusalError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly fieldIds: string[];
  readonly provider: string;
  readonly modelId: string;

  constructor({
    fieldIds,
    provider,
    modelId,
    message = `Extraction model "${modelId}" from provider "${provider}" refused ${fieldIds.length === 1 ? 'field' : 'fields'} ${fieldIds.map(id => JSON.stringify(id)).join(', ')}.`,
  }: {
    fieldIds: string[];
    provider: string;
    modelId: string;
    message?: string;
  }) {
    super({ name, message });

    this.fieldIds = fieldIds;
    this.provider = provider;
    this.modelId = modelId;
  }

  static isInstance(error: unknown): error is ExtractionRefusalError {
    return AISDKError.hasMarker(error, marker);
  }
}
