import {
  AISDKError,
  type LanguageModelV2Content,
  type LanguageModelV2ToolChoice,
} from '@ai-sdk/provider';
import type { FinishReason } from '../types/language-model';

const name = 'AI_ToolChoiceViolationError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

type EnforcedToolChoice = Extract<LanguageModelV2ToolChoice, { type: 'none' }>;

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

  /**
   * The normalized content returned by the model.
   */
  readonly content: Array<LanguageModelV2Content>;

  constructor({
    toolChoice,
    finishReason,
    provider,
    modelId,
    content,
    message = 'Model response contained a tool call even though tool choice was none.',
  }: {
    toolChoice: EnforcedToolChoice;
    finishReason: FinishReason;
    provider: string;
    modelId: string;
    content: Array<LanguageModelV2Content>;
    message?: string;
  }) {
    super({ name, message });

    this.toolChoice = toolChoice;
    this.finishReason = finishReason;
    this.provider = provider;
    this.modelId = modelId;
    this.content = content;
  }

  static isInstance(error: unknown): error is ToolChoiceViolationError {
    return AISDKError.hasMarker(error, marker);
  }
}
