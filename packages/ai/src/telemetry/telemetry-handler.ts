import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3ToolChoice,
} from '@ai-sdk/provider';
import { FinishReason, ProviderMetadata } from '../types';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { LanguageModelUsage } from '../types/usage';

type ModelInfo = Readonly<Pick<LanguageModelV3, 'provider' | 'modelId'>>;

export type TelemetryOnStartEvent = {
  readonly model: ModelInfo;
  readonly system: unknown;
  readonly prompt: unknown;
  readonly messages: unknown;
  readonly settings: Readonly<
    Pick<
      LanguageModelV3CallOptions,
      | 'maxOutputTokens'
      | 'temperature'
      | 'topP'
      | 'topK'
      | 'presencePenalty'
      | 'frequencyPenalty'
      | 'stopSequences'
      | 'seed'
    >
  > & { readonly maxRetries: number };
  readonly functionId: string | undefined;
  readonly metadata: Record<string, unknown> | undefined;
};

export type TelemetryOnStepStartEvent = {
  readonly stepNumber: number;
  readonly model: ModelInfo;
  readonly promptMessages: LanguageModelV3Prompt;
  readonly tools: Record<string, unknown> | undefined;
  readonly toolChoice: LanguageModelV3ToolChoice | undefined;
};

export type TelemetryOnStepFinishEvent = {
  readonly stepNumber: number;
  readonly finishReason: FinishReason;
  readonly text: string;
  readonly reasoningText: string | undefined;
  readonly toolCalls: ReadonlyArray<{
    readonly toolName: string;
    readonly toolCallId: string;
    readonly input: unknown;
  }>;
  readonly usage: LanguageModelUsage;
  readonly response: LanguageModelResponseMetadata;
  readonly providerMetadata: ProviderMetadata | undefined;
};

export type TelemetryOnToolCallStartEvent = {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly input: unknown;
};

export type TelemetryOnToolCallFinishEvent = {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly input: unknown;
  readonly output: unknown | undefined;
  readonly error: unknown | undefined;
  readonly durationMs: number;
};

export type TelemetryOnFinishEvent = {
  readonly finishReason: FinishReason;
  readonly text: string;
  readonly reasoningText: string | undefined;
  readonly toolCalls: ReadonlyArray<{
    readonly toolName: string;
    readonly toolCallId: string;
    readonly input: unknown;
  }>;
  readonly usage: LanguageModelUsage;
  readonly totalUsage: LanguageModelUsage;
  readonly response: LanguageModelResponseMetadata;
  readonly providerMetadata: ProviderMetadata | undefined;
};

/**
 * Generic telemetry handler contract. Any telemetry adapter (OTEL, diagnostics
 * channel, etc.) implements this interface to receive lifecycle events from
 * core SDK functions like generateText and streamText.
 */
export type TelemetryHandler = {
  onStart: (event: TelemetryOnStartEvent) => Promise<void>;
  onStepStart: (event: TelemetryOnStepStartEvent) => Promise<void>;
  onStepFinish: (event: TelemetryOnStepFinishEvent) => Promise<void>;
  onToolCallStart: (event: TelemetryOnToolCallStartEvent) => Promise<void>;
  onToolCallFinish: (event: TelemetryOnToolCallFinishEvent) => Promise<void>;
  onFinish: (event: TelemetryOnFinishEvent) => Promise<void>;
};
