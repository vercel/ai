import type { LanguageModelV4ResponseMetadata } from '@ai-sdk/provider';
import type { ModelMessage, SystemModelMessage } from '@ai-sdk/provider-utils';
import {
  type FinishReason,
  generateId,
  type LanguageModelUsage,
  type StepResult,
  type StopCondition,
  type ToolChoice,
  type ToolSet,
  type UIMessageChunk,
} from 'ai';
import { resolveLanguageModel, streamModelCall } from 'ai/internal';
import type {
  ProviderOptions,
  StreamTextTransform,
  TelemetrySettings,
  ToolCallRepairFunction,
} from './durable-agent.js';
import { recordSpan } from './telemetry.js';
import type { CompatibleLanguageModel } from './types.js';

export type ModelStopCondition = StopCondition<NoInfer<ToolSet>>;

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
  sendStart?: boolean;
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
  experimental_telemetry?: TelemetrySettings;
  transforms?: Array<StreamTextTransform<ToolSet>>;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  /**
   * If true, collects and returns all UIMessageChunks written to the stream.
   * This is used by DurableAgent when collectUIMessages is enabled.
   */
  collectUIChunks?: boolean;
}

/**
 * Tool call as returned from the stream after parsing by createStreamTextPartTransform.
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
 * Finish metadata captured from the stream.
 */
export interface StreamFinish {
  finishReason: FinishReason;
  rawFinishReason: string | undefined;
  usage: LanguageModelUsage;
  providerMetadata?: Record<string, unknown>;
}

export async function doStreamStep(
  modelInit: string | (() => Promise<CompatibleLanguageModel>),
  messages: ModelMessage[],
  system: string | SystemModelMessage | Array<SystemModelMessage> | undefined,
  writable: WritableStream<UIMessageChunk>,
  tools?: ToolSet,
  options?: DoStreamStepOptions,
) {
  'use step';

  // 1. Resolve model inside step (must happen here for serialization boundary)
  let model: CompatibleLanguageModel | undefined;
  if (typeof modelInit === 'string') {
    model = resolveLanguageModel(modelInit) as CompatibleLanguageModel;
  } else if (typeof modelInit === 'function') {
    model = await modelInit();
  } else {
    throw new Error(
      'Invalid "model initialization" argument. Must be a string or a function that returns a LanguageModel instance.',
    );
  }

  // 2. Call streamModelCall — handles prompt conversion, tool preparation,
  //    model.doStream(), and createStreamTextPartTransform internally
  const { stream } = await streamModelCall({
    model: model as any, // CompatibleLanguageModel → LanguageModel
    messages,
    system,
    tools,
    toolChoice: options?.toolChoice,
    includeRawChunks: options?.includeRawChunks,
    providerOptions: options?.providerOptions,
    repairToolCall: options?.repairToolCall,
    maxRetries: options?.maxRetries,
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
  });

  // 3. Consume stream, capture data, convert to UIMessageChunks, write to writable
  const toolCalls: ParsedToolCall[] = [];
  const providerExecutedToolResults = new Map<
    string,
    ProviderExecutedToolResult
  >();
  let finish: StreamFinish | undefined;
  const collectUIChunks = options?.collectUIChunks ?? false;
  const uiChunks: UIMessageChunk[] = [];
  let responseMetadata: LanguageModelV4ResponseMetadata | undefined;

  // Collected data for StepResult aggregation
  let text = '';
  const reasoningParts: Array<{ text: string }> = [];
  const files: Array<{
    mediaType: string;
    base64: string;
    uint8Array: Uint8Array;
  }> = [];
  const sources: Array<any> = [];
  let warnings: Array<any> | undefined;

  const writer = writable.getWriter();

  try {
    // Write start chunks
    if (options?.sendStart) {
      const startChunk: UIMessageChunk = {
        type: 'start',
        messageId: generateId(),
      };
      await writer.write(startChunk);
      if (collectUIChunks) uiChunks.push(startChunk);
    }
    const startStepChunk: UIMessageChunk = { type: 'start-step' };
    await writer.write(startStepChunk);
    if (collectUIChunks) uiChunks.push(startStepChunk);

    for await (const part of stream) {
      const uiChunk = partToUIChunk(part);

      // Capture data for aggregation
      switch (part.type) {
        case 'text-delta':
          text += part.text;
          break;
        case 'reasoning-delta':
          reasoningParts.push({ text: part.text });
          break;
        case 'file': {
          const file = part.file;
          files.push({
            mediaType: file.mediaType,
            base64: file.base64,
            uint8Array: file.uint8Array,
          });
          break;
        }
        case 'source':
          sources.push(part);
          break;
        case 'tool-call':
          toolCalls.push({
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            providerExecuted: part.providerExecuted,
            providerMetadata: part.providerMetadata as
              | Record<string, unknown>
              | undefined,
            dynamic: (part as any).dynamic,
            invalid: (part as any).invalid,
            error: (part as any).error,
          });
          break;
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
        case 'tool-error':
          if ((part as any).providerExecuted) {
            providerExecutedToolResults.set(part.toolCallId, {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: (part as any).error,
              isError: true,
            });
          }
          break;
        case 'finish':
          finish = {
            finishReason: part.finishReason,
            rawFinishReason: part.rawFinishReason,
            usage: part.usage,
            providerMetadata: part.providerMetadata as
              | Record<string, unknown>
              | undefined,
          };
          break;
        case 'stream-start':
          warnings = part.warnings;
          break;
        case 'response-metadata':
          responseMetadata = part;
          break;
      }

      // Write UI chunk to stream
      if (uiChunk) {
        await writer.write(uiChunk);
        if (collectUIChunks) uiChunks.push(uiChunk);
      }
    }

    // Write finish-step chunk
    const finishStepChunk: UIMessageChunk = { type: 'finish-step' };
    await writer.write(finishStepChunk);
    if (collectUIChunks) uiChunks.push(finishStepChunk);
  } finally {
    writer.releaseLock();
  }

  // 4. Build StepResult
  const reasoningText = reasoningParts.map(r => r.text).join('') || undefined;

  const step: StepResult<any> = {
    callId: 'durable-agent',
    stepNumber: 0, // overridden by caller
    model: {
      provider: responseMetadata?.modelId?.split(':')[0] ?? 'unknown',
      modelId: responseMetadata?.modelId ?? 'unknown',
    },
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
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
    files,
    sources,
    toolCalls: toolCalls
      .filter(tc => !tc.invalid)
      .map(tc => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
        ...(tc.dynamic ? { dynamic: true as const } : {}),
      })),
    staticToolCalls: toolCalls
      .filter(tc => !tc.invalid && !tc.dynamic)
      .map(tc => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
      })),
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
    usage: finish?.usage ?? {
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
    },
    warnings,
    request: { body: '' },
    response: {
      id: responseMetadata?.id ?? 'unknown',
      timestamp: responseMetadata?.timestamp ?? new Date(),
      modelId: responseMetadata?.modelId ?? 'unknown',
      messages: [],
    },
    providerMetadata: finish?.providerMetadata ?? {},
  } as StepResult<any>;

  return {
    toolCalls,
    finish,
    step,
    uiChunks: collectUIChunks ? uiChunks : undefined,
    providerExecutedToolResults,
  };
}

/**
 * Convert an UglyTransformedStreamTextPart to a UIMessageChunk.
 * Returns undefined for parts that don't map to UI chunks.
 */
function partToUIChunk(part: any): UIMessageChunk | undefined {
  switch (part.type) {
    case 'text-start':
      return {
        type: 'text-start',
        id: part.id,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'text-delta':
      return {
        type: 'text-delta',
        id: part.id,
        delta: part.text,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'text-end':
      return {
        type: 'text-end',
        id: part.id,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'reasoning-start':
      return {
        type: 'reasoning-start',
        id: part.id,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'reasoning-delta':
      return {
        type: 'reasoning-delta',
        id: part.id,
        delta: part.text,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'reasoning-end':
      return {
        type: 'reasoning-end',
        id: part.id,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'file': {
      const file = part.file;
      let url: string;
      if (file.base64) {
        url = `data:${file.mediaType};base64,${file.base64}`;
      } else if (file.url) {
        url = file.url;
      } else {
        url = `data:${file.mediaType};base64,`;
      }
      return {
        type: 'file',
        mediaType: file.mediaType,
        url,
      };
    }

    case 'source': {
      if (part.sourceType === 'url') {
        return {
          type: 'source-url',
          sourceId: part.id,
          url: part.url,
          title: part.title,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        };
      }
      if (part.sourceType === 'document') {
        return {
          type: 'source-document',
          sourceId: part.id,
          mediaType: part.mediaType,
          title: part.title,
          filename: part.filename,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        };
      }
      return undefined;
    }

    case 'tool-input-start':
      return {
        type: 'tool-input-start',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        ...(part.providerExecuted != null
          ? { providerExecuted: part.providerExecuted }
          : {}),
      };

    case 'tool-input-delta':
      return {
        type: 'tool-input-delta',
        toolCallId: part.toolCallId,
        inputTextDelta: part.inputTextDelta,
      };

    case 'tool-call': {
      if (part.invalid) {
        return {
          type: 'tool-input-error',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
          errorText:
            part.error instanceof Error
              ? part.error.message
              : String(part.error ?? 'Invalid tool call'),
        };
      }
      return {
        type: 'tool-input-available',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
        ...(part.providerExecuted != null
          ? { providerExecuted: part.providerExecuted }
          : {}),
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };
    }

    case 'tool-result':
      return {
        type: 'tool-output-available',
        toolCallId: part.toolCallId,
        output: part.output,
      };

    case 'tool-error':
      return {
        type: 'tool-output-error',
        toolCallId: part.toolCallId,
        errorText:
          part.error instanceof Error ? part.error.message : String(part.error),
      };

    case 'error': {
      const error = part.error;
      return {
        type: 'error',
        errorText: error instanceof Error ? error.message : String(error),
      };
    }

    // These don't produce UI chunks
    case 'finish':
    case 'stream-start':
    case 'response-metadata':
    case 'raw':
    case 'tool-input-end':
      return undefined;

    default:
      return undefined;
  }
}
