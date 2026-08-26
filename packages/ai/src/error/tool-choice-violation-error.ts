import { AISDKError, type LanguageModelV3ToolChoice } from '@ai-sdk/provider';
import type { FinishReason } from '../types/language-model';

const name = 'AI_ToolChoiceViolationError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

type EnforcedToolChoice = Extract<
  LanguageModelV3ToolChoice,
  { type: 'required' } | { type: 'tool' }
>;

/**
 * Thrown when a model response does not satisfy an enforced tool choice.
 */
export class ToolChoiceViolationError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  /**
   * The tool choice that the model response did not satisfy.
   */
  readonly toolChoice: EnforcedToolChoice;

  /**
   * Reason why the model finished generating the response.
   */
  readonly finishReason: FinishReason;

  /**
   * The provider that returned the response.
   */
  readonly provider: string;

  /**
   * The model that returned the response.
   */
  readonly modelId: string;

  constructor({
    toolChoice,
    finishReason,
    provider,
    modelId,
    message = toolChoice.type === 'required'
      ? 'Model response did not contain a tool call even though tool choice was required.'
      : `Model response did not contain a call to the required tool '${toolChoice.toolName}'.`,
  }: {
    toolChoice: EnforcedToolChoice;
    finishReason: FinishReason;
    provider: string;
    modelId: string;
    message?: string;
  }) {
    super({ name, message });

    this.toolChoice = toolChoice;
    this.finishReason = finishReason;
    this.provider = provider;
    this.modelId = modelId;
  }

  static isInstance(error: unknown): error is ToolChoiceViolationError {
    return AISDKError.hasMarker(error, marker);
  }
}
