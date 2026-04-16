import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import {
  type Experimental_LanguageModelStreamPart as ModelCallStreamPart,
  experimental_streamLanguageModelCall as streamModelCall,
  type FinishReason,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type StepResult,
  type StopCondition,
  type ToolCallRepairFunction,
  type ToolChoice,
  type ToolSet,
} from 'ai';
import { gateway } from 'ai';
import type { ProviderOptions, TelemetryOptions } from './workflow-agent.js';
import {
  resolveSerializableTools,
  type SerializableToolDef,
} from './serializable-schema.js';

export type { Experimental_LanguageModelStreamPart as ModelCallStreamPart } from 'ai';

export type ModelStopCondition = StopCondition<NoInfer<ToolSet>, any>;

/**
 * Provider-executed tool result captured from the stream.
 */
export interface ProviderExecutedToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

/**
 * Options for the doStreamStep function.
 */
export interface DoStreamStepOptions {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
  providerOptions?: ProviderOptions;
  toolChoice?: ToolChoice<ToolSet>;
  includeRawChunks?: boolean;
  experimental_telemetry?: TelemetryOptions;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
}

/**
 * Parsed tool call from the stream (parsed by streamModelCall's transform).
 */
export interface ParsedToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerExecuted?: boolean;
  providerMetadata?: Record<string, unknown>;
  dynamic?: boolean;
  invalid?: boolean;
  error?: unknown;
}

/**
 * Finish metadata from the stream.
 */
export interface StreamFinish {
  finishReason: FinishReason;
  rawFinishReason: string | undefined;
  usage: LanguageModelUsage;
  providerMetadata?: Record<string, unknown>;
}

export async function doStreamStep(
  conversationPrompt: LanguageModelV4Prompt,
  modelInit: LanguageModel,
  writable?: WritableStream<ModelCallStreamPart<ToolSet>>,
  serializedTools?: Record<string, SerializableToolDef>,
  options?: DoStreamStepOptions,
) {
  'use step';

  // Resolve model inside step (must happen here for serialization boundary)
  const model: LanguageModel =
    typeof modelInit === 'string'
      ? gateway.languageModel(modelInit)
      : modelInit;

  // Reconstruct tools from serializable definitions with Ajv validation.
  // Tools are serialized before crossing the step boundary because zod schemas
  // contain functions that can't be serialized by the workflow runtime.
  const tools = serializedTools
    ? resolveSerializableTools(serializedTools)
    : undefined;

  // streamModelCall handles: prompt standardization, tool preparation,
  // model.doStream(), retry logic, and stream part transformation
  // (tool call parsing, finish reason mapping, file wrapping).
  const { stream: modelStream } = await streamModelCall({
    model,
    // streamModelCall expects Prompt (ModelMessage[]) but we pass the
    // pre-converted LanguageModelV4Prompt. standardizePrompt inside
    // streamModelCall handles both formats.
    messages: conversationPrompt as unknown as ModelMessage[],
    tools,
    toolChoice: options?.toolChoice,
    includeRawChunks: options?.includeRawChunks,
    providerOptions: options?.providerOptions,
    abortSignal: options?.abortSignal,
    headers: options?.headers,
    maxOutputTokens: options?.maxOutputTokens,
    temperature: options?.temperature,
    topP: options?.topP,
    topK: options?.topK,
    presencePenalty: options?.presencePenalty,
    frequencyPenalty: options?.frequencyPenalty,
    stopSequences: options?.stopSequences,
    seed: options?.seed,
    repairToolCall: options?.repairToolCall,
  });

  // Consume the stream: capture data and write to writable in real-time
  const toolCalls: ParsedToolCall[] = [];
  const providerExecutedToolResults = new Map<
    string,
    ProviderExecutedToolResult
  >();
  let finish: StreamFinish | undefined;

  // Aggregation for StepResult
  let text = '';
  const reasoningParts: Array<{ text: string }> = [];
  let responseMetadata:
    | { id?: string; timestamp?: Date; modelId?: string }
    | undefined;
  let warnings: unknown[] | undefined;

  // Acquire writer once before the loop to avoid per-chunk lock overhead
  const writer = writable?.getWriter();

  try {
    for await (const part of modelStream) {
      switch (part.type) {
        case 'text-delta':
          text += part.text;
          break;
        case 'reasoning-delta':
          reasoningParts.push({ text: part.text });
          break;
        case 'tool-call': {
          // parseToolCall adds dynamic/invalid/error at runtime
          const toolCallPart = part as typeof part & Partial<ParsedToolCall>;
          toolCalls.push({
            type: 'tool-call',
            toolCallId: toolCallPart.toolCallId,
            toolName: toolCallPart.toolName,
            input: toolCallPart.input,
            providerExecuted: toolCallPart.providerExecuted,
            providerMetadata: toolCallPart.providerMetadata as
              | Record<string, unknown>
              | undefined,
            dynamic: toolCallPart.dynamic,
            invalid: toolCallPart.invalid,
            error: toolCallPart.error,
          });
          break;
        }
        case 'tool-result':
          if (part.providerExecuted) {
            providerExecutedToolResults.set(part.toolCallId, {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.output,
              isError: false,
            });
          }
          break;
        case 'tool-error': {
          const errorPart = part as typeof part & {
            providerExecuted?: boolean;
          };
          if (errorPart.providerExecuted) {
            providerExecutedToolResults.set(errorPart.toolCallId, {
              toolCallId: errorPart.toolCallId,
              toolName: errorPart.toolName,
              result: errorPart.error,
              isError: true,
            });
          }
          break;
        }
        case 'model-call-end':
          finish = {
            finishReason: part.finishReason,
            rawFinishReason: part.rawFinishReason,
            usage: part.usage,
            providerMetadata: part.providerMetadata as
              | Record<string, unknown>
              | undefined,
          };
          break;
        case 'model-call-start':
          warnings = part.warnings;
          break;
        case 'model-call-response-metadata':
          responseMetadata = part;
          break;
      }

      // Write to writable in real-time
      if (writer) {
        await writer.write(part);
      }
    }
  } finally {
    writer?.releaseLock();
  }

  // Build StepResult
  const reasoningText = reasoningParts.map(r => r.text).join('') || undefined;

  const step: StepResult<ToolSet, any> = {
    callId: 'workflow-agent',
    stepNumber: 0,
    model: {
      provider: responseMetadata?.modelId?.split(':')[0] ?? 'unknown',
      modelId: responseMetadata?.modelId ?? 'unknown',
    },
    functionId: undefined,
    metadata: undefined,
    context: undefined,
    toolsContext: {},
    content: [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...toolCalls
        .filter(tc => !tc.invalid)
        .map(tc => ({
          type: 'tool-call' as const,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.input,
          ...(tc.dynamic ? { dynamic: true as const } : {}),
        })),
    ],
    text,
    reasoning: reasoningParts.map(r => ({
      type: 'reasoning' as const,
      text: r.text,
    })),
    reasoningText,
    files: [],
    sources: [],
    toolCalls: toolCalls
      .filter(tc => !tc.invalid)
      .map(tc => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
        ...(tc.dynamic ? { dynamic: true as const } : {}),
      })),
    staticToolCalls: [],
    dynamicToolCalls: toolCalls
      .filter(tc => !tc.invalid && tc.dynamic)
      .map(tc => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
        dynamic: true as const,
      })),
    toolResults: [],
    staticToolResults: [],
    dynamicToolResults: [],
    finishReason: finish?.finishReason ?? 'other',
    rawFinishReason: finish?.rawFinishReason,
    usage:
      finish?.usage ??
      ({
        inputTokens: 0,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokens: 0,
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
        totalTokens: 0,
      } as LanguageModelUsage),
    warnings,
    request: { body: '' },
    response: {
      id: responseMetadata?.id ?? 'unknown',
      timestamp: responseMetadata?.timestamp ?? new Date(),
      modelId: responseMetadata?.modelId ?? 'unknown',
      messages: [],
    },
    providerMetadata: finish?.providerMetadata ?? {},
  } as StepResult<ToolSet, any>;

  return {
    toolCalls,
    finish,
    step,
    providerExecutedToolResults,
  };
}
