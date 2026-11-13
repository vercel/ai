import { AISDKError } from './ai-sdk-error';

const name = 'AI_ExtractionUnsupportedFieldTypeError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * An extraction model does not support the type of a requested field.
 */
export class ExtractionUnsupportedFieldTypeError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  readonly fieldId: string;
  readonly fieldType: string;
  readonly provider: string;
  readonly modelId: string;

  constructor({
    fieldId,
    fieldType,
    provider,
    modelId,
    message = `Field "${fieldId}" has type "${fieldType}", which is not supported by provider "${provider}" and model "${modelId}".`,
  }: {
    fieldId: string;
    fieldType: string;
    provider: string;
    modelId: string;
    message?: string;
  }) {
    super({ name, message });

    this.fieldId = fieldId;
    this.fieldType = fieldType;
    this.provider = provider;
    this.modelId = modelId;
  }

  static isInstance(
    error: unknown,
  ): error is ExtractionUnsupportedFieldTypeError {
    return AISDKError.hasMarker(error, marker);
  }
}
