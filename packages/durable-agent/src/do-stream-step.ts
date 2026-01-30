import type {
  LanguageModelV2CallOptions,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2ToolCall,
  LanguageModelV2ToolChoice,
  SharedV2ProviderOptions,
} from '@ai-sdk/provider';
import {
  type FinishReason,
  gateway,
  generateId,
  type StepResult,
  type StopCondition,
  type ToolChoice,
  type ToolSet,
  type UIMessageChunk,
} from 'ai';
import type {
  ProviderOptions,
  StreamTextTransform,
  TelemetrySettings,
} from './durable-agent.js';
import type { CompatibleLanguageModel } from './types.js';

export type FinishPart = Extract<LanguageModelV2StreamPart, { type: 'finish' }>;

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
 * Convert a Uint8Array to a base64 string safely.
 * Uses a loop instead of spread operator to avoid stack overflow on large arrays.
 */
function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
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
  responseFormat?: LanguageModelV2CallOptions['responseFormat'];
  /**
   * If true, collects and returns all UIMessageChunks written to the stream.
   * This is used by DurableAgent when collectUIMessages is enabled.
   */
  collectUIChunks?: boolean;
}

/**
 * Convert AI SDK ToolChoice to LanguageModelV2ToolChoice
 */
function toLanguageModelToolChoice(
  toolChoice: ToolChoice<ToolSet> | undefined,
): LanguageModelV2ToolChoice | undefined {
  if (toolChoice === undefined) {
    return undefined;
  }
  if (toolChoice === 'auto') {
    return { type: 'auto' };
  }
  if (toolChoice === 'none') {
    return { type: 'none' };
  }
  if (toolChoice === 'required') {
    return { type: 'required' };
  }
  if (typeof toolChoice === 'object' && toolChoice.type === 'tool') {
    return { type: 'tool', toolName: toolChoice.toolName };
  }
  return undefined;
}

export async function doStreamStep(
  conversationPrompt: LanguageModelV2Prompt,
  modelInit: string | (() => Promise<CompatibleLanguageModel>),
  writable: WritableStream<UIMessageChunk>,
  tools?: LanguageModelV2CallOptions['tools'],
  options?: DoStreamStepOptions,
) {
  // Model can be LanguageModelV2 (AI SDK v5) or LanguageModelV3 (AI SDK v6)
  // Both have compatible doStream interfaces for our use case
  let model: CompatibleLanguageModel | undefined;
  if (typeof modelInit === 'string') {
    // gateway() returns LanguageModelV2 in AI SDK v5 and LanguageModelV3 in AI SDK v6
    // Both are compatible at runtime for doStream operations
    model = gateway(modelInit) as CompatibleLanguageModel;
  } else if (typeof modelInit === 'function') {
    // User-provided model factory - could return V2 or V3
    model = await modelInit();
  } else {
    throw new Error(
      'Invalid "model initialization" argument. Must be a string or a function that returns a LanguageModel instance.',
    );
  }

  // Build call options with all generation settings
  const callOptions: LanguageModelV2CallOptions = {
    prompt: conversationPrompt,
    tools,
    ...(options?.maxOutputTokens !== undefined && {
      maxOutputTokens: options.maxOutputTokens,
    }),
    ...(options?.temperature !== undefined && {
      temperature: options.temperature,
    }),
    ...(options?.topP !== undefined && { topP: options.topP }),
    ...(options?.topK !== undefined && { topK: options.topK }),
    ...(options?.presencePenalty !== undefined && {
      presencePenalty: options.presencePenalty,
    }),
    ...(options?.frequencyPenalty !== undefined && {
      frequencyPenalty: options.frequencyPenalty,
    }),
    ...(options?.stopSequences !== undefined && {
      stopSequences: options.stopSequences,
    }),
    ...(options?.seed !== undefined && { seed: options.seed }),
    ...(options?.abortSignal !== undefined && {
      abortSignal: options.abortSignal,
    }),
    ...(options?.headers !== undefined && { headers: options.headers }),
    ...(options?.providerOptions !== undefined && {
      providerOptions: options.providerOptions as SharedV2ProviderOptions,
    }),
    ...(options?.toolChoice !== undefined && {
      toolChoice: toLanguageModelToolChoice(options.toolChoice),
    }),
    ...(options?.includeRawChunks !== undefined && {
      includeRawChunks: options.includeRawChunks,
    }),
    ...(options?.responseFormat !== undefined && {
      responseFormat: options.responseFormat,
    }),
  };

  const result = await model.doStream(callOptions);

  let finish: FinishPart | undefined;
  const toolCalls: LanguageModelV2ToolCall[] = [];
  // Map of tool call ID to provider-executed tool result
  const providerExecutedToolResults = new Map<
    string,
    ProviderExecutedToolResult
  >();
  const chunks: LanguageModelV2StreamPart[] = [];
  const includeRawChunks = options?.includeRawChunks ?? false;
  const collectUIChunks = options?.collectUIChunks ?? false;
  const uiChunks: UIMessageChunk[] = [];

  // Build the stream pipeline
  let stream: ReadableStream<LanguageModelV2StreamPart> = result.stream;

  // Apply custom transforms if provided
  if (options?.transforms && options.transforms.length > 0) {
    let terminated = false;
    const stopStream = () => {
      terminated = true;
    };

    for (const transform of options.transforms) {
      if (!terminated) {
        stream = stream.pipeThrough(
          transform({
            tools: {} as ToolSet, // Note: toolSet not available inside step boundary due to serialization
            stopStream,
          }),
        );
      }
    }
  }

  await stream
    .pipeThrough(
      new TransformStream({
        async transform(chunk, controller) {
          if (chunk.type === 'tool-call') {
            toolCalls.push({
              ...chunk,
              input: chunk.input || '{}',
            });
          } else if (chunk.type === 'tool-result') {
            // Capture provider-executed tool results
            if (chunk.providerExecuted) {
              providerExecutedToolResults.set(chunk.toolCallId, {
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                result: chunk.result,
                isError: chunk.isError,
              });
            }
          } else if (chunk.type === 'finish') {
            finish = chunk;
          }
          chunks.push(chunk);
          controller.enqueue(chunk);
        },
      }),
    )
    .pipeThrough(
      new TransformStream<LanguageModelV2StreamPart, UIMessageChunk>({
        start: controller => {
          if (options?.sendStart) {
            controller.enqueue({
              type: 'start',
              // Note that if useChat is used client-side, useChat will generate a different
              // messageId. It's hard to work around this.
              messageId: generateId(),
            });
          }
          controller.enqueue({
            type: 'start-step',
          });
        },
        flush: controller => {
          controller.enqueue({
            type: 'finish-step',
          });
        },
        transform: async (part, controller) => {
          const partType = part.type;
          switch (partType) {
            case 'text-start': {
              controller.enqueue({
                type: 'text-start',
                id: part.id,
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
              });
              break;
            }

            case 'text-delta': {
              controller.enqueue({
                type: 'text-delta',
                id: part.id,
                delta: part.delta,
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
              });
              break;
            }

            case 'text-end': {
              controller.enqueue({
                type: 'text-end',
                id: part.id,
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
              });
              break;
            }

            case 'reasoning-start': {
              controller.enqueue({
                type: 'reasoning-start',
                id: part.id,
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
              });
              break;
            }

            case 'reasoning-delta': {
              controller.enqueue({
                type: 'reasoning-delta',
                id: part.id,
                delta: part.delta,
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
              });

              break;
            }

            case 'reasoning-end': {
              controller.enqueue({
                type: 'reasoning-end',
                id: part.id,
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
              });
              break;
            }

            case 'file': {
              // Convert data to URL, handling Uint8Array, URL, and string cases
              let url: string;
              const fileData = part.data as Uint8Array | string | URL;
              if (fileData instanceof Uint8Array) {
                // Convert Uint8Array to base64 and create data URL
                const base64 = uint8ArrayToBase64(fileData);
                url = `data:${part.mediaType};base64,${base64}`;
              } else if (fileData instanceof URL) {
                // Use URL directly (could be a data URL or remote URL)
                url = fileData.href;
              } else if (
                fileData.startsWith('data:') ||
                fileData.startsWith('http:') ||
                fileData.startsWith('https:')
              ) {
                // Already a URL string
                url = fileData;
              } else {
                // Assume it's base64-encoded data
                url = `data:${part.mediaType};base64,${fileData}`;
              }
              controller.enqueue({
                type: 'file',
                mediaType: part.mediaType,
                url,
              });
              break;
            }

            case 'source': {
              if (part.sourceType === 'url') {
                controller.enqueue({
                  type: 'source-url',
                  sourceId: part.id,
                  url: part.url,
                  title: part.title,
                  ...(part.providerMetadata != null
                    ? { providerMetadata: part.providerMetadata }
                    : {}),
                });
              }

              if (part.sourceType === 'document') {
                controller.enqueue({
                  type: 'source-document',
                  sourceId: part.id,
                  mediaType: part.mediaType,
                  title: part.title,
                  filename: part.filename,
                  ...(part.providerMetadata != null
                    ? { providerMetadata: part.providerMetadata }
                    : {}),
                });
              }
              break;
            }

            case 'tool-input-start': {
              controller.enqueue({
                type: 'tool-input-start',
                toolCallId: part.id,
                toolName: part.toolName,
                ...(part.providerExecuted != null
                  ? { providerExecuted: part.providerExecuted }
                  : {}),
              });
              break;
            }

            case 'tool-input-delta': {
              controller.enqueue({
                type: 'tool-input-delta',
                toolCallId: part.id,
                inputTextDelta: part.delta,
              });
              break;
            }

            case 'tool-input-end': {
              // End of tool input streaming - no UI chunk needed
              break;
            }

            case 'tool-call': {
              controller.enqueue({
                type: 'tool-input-available',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: JSON.parse(part.input || '{}'),
                ...(part.providerExecuted != null
                  ? { providerExecuted: part.providerExecuted }
                  : {}),
                ...(part.providerMetadata != null
                  ? { providerMetadata: part.providerMetadata }
                  : {}),
              });
              break;
            }

            case 'tool-result': {
              controller.enqueue({
                type: 'tool-output-available',
                toolCallId: part.toolCallId,
                output: part.result,
                ...(part.providerExecuted != null
                  ? { providerExecuted: part.providerExecuted }
                  : {}),
              });
              break;
            }

            case 'error': {
              const error = part.error;
              controller.enqueue({
                type: 'error',
                errorText:
                  error instanceof Error ? error.message : String(error),
              });

              break;
            }

            case 'stream-start': {
              // Stream start is internal, no UI chunk needed
              break;
            }

            case 'response-metadata': {
              // Response metadata is internal, no UI chunk needed
              break;
            }

            case 'finish': {
              // Finish is handled separately
              break;
            }

            case 'raw': {
              // Raw chunks are only included if explicitly requested
              if (includeRawChunks) {
                // Raw chunks contain provider-specific data
                // We don't have a direct mapping to UIMessageChunk
                // but we can log or handle them if needed
              }
              break;
            }

            default: {
              // Handle any other chunk types gracefully
              // const exhaustiveCheck: never = partType;
              // console.warn(`Unknown chunk type: ${partType}`);
            }
          }
        },
      }),
    )
    .pipeThrough(
      // Optionally collect UIMessageChunks for later conversion to UIMessage[]
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform: (chunk, controller) => {
          if (collectUIChunks) {
            uiChunks.push(chunk);
          }
          controller.enqueue(chunk);
        },
      }),
    )
    .pipeTo(writable, { preventClose: true });

  const step = chunksToStep(chunks, toolCalls, conversationPrompt, finish);
  return {
    toolCalls,
    finish,
    step,
    uiChunks: collectUIChunks ? uiChunks : undefined,
    providerExecutedToolResults,
  };
}

/**
 * Normalize the finish reason to the AI SDK FinishReason type.
 * AI SDK v6 may return an object with a 'type' property,
 * while AI SDK v5 returns a plain string. This function handles both.
 *
 * @internal Exported for testing
 */
export function normalizeFinishReason(rawFinishReason: unknown): FinishReason {
  // Handle object-style finish reason (possible in some AI SDK versions/providers)
  if (typeof rawFinishReason === 'object' && rawFinishReason !== null) {
    const objReason = rawFinishReason as { type?: string };
    return (objReason.type as FinishReason) ?? 'other';
  }
  // Handle string finish reason (standard format)
  if (typeof rawFinishReason === 'string') {
    return rawFinishReason as FinishReason;
  }
  return 'other';
}

// This is a stand-in for logic in the AI-SDK streamText code which aggregates
// chunks into a single step result.
function chunksToStep(
  chunks: LanguageModelV2StreamPart[],
  toolCalls: LanguageModelV2ToolCall[],
  conversationPrompt: LanguageModelV2Prompt,
  finish?: FinishPart,
): StepResult<any> {
  // Transform chunks to a single step result
  const text = chunks
    .filter(
      (chunk): chunk is Extract<typeof chunk, { type: 'text-delta' }> =>
        chunk.type === 'text-delta',
    )
    .map(chunk => chunk.delta)
    .join('');

  const reasoning = chunks.filter(
    (chunk): chunk is Extract<typeof chunk, { type: 'reasoning-delta' }> =>
      chunk.type === 'reasoning-delta',
  );

  const reasoningText = reasoning.map(chunk => chunk.delta).join('');

  // Extract warnings from stream-start chunk
  const streamStart = chunks.find(
    (chunk): chunk is Extract<typeof chunk, { type: 'stream-start' }> =>
      chunk.type === 'stream-start',
  );

  // Extract response metadata from response-metadata chunk
  const responseMetadata = chunks.find(
    (chunk): chunk is Extract<typeof chunk, { type: 'response-metadata' }> =>
      chunk.type === 'response-metadata',
  );

  // Extract files from file chunks
  // File chunks contain mediaType and data (base64 string or Uint8Array)
  // GeneratedFile requires both base64 and uint8Array properties
  const files = chunks
    .filter(
      (chunk): chunk is Extract<typeof chunk, { type: 'file' }> =>
        chunk.type === 'file',
    )
    .map(chunk => {
      const data = chunk.data;
      // If data is already a Uint8Array, convert to base64; otherwise use as-is
      if (data instanceof Uint8Array) {
        // Convert Uint8Array to base64 string
        const base64 = uint8ArrayToBase64(data);
        return {
          mediaType: chunk.mediaType,
          base64,
          uint8Array: data,
        };
      } else {
        // Data is base64 string, decode to Uint8Array
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return {
          mediaType: chunk.mediaType,
          base64: data,
          uint8Array: bytes,
        };
      }
    });

  // Extract sources from source chunks
  const sources = chunks
    .filter(
      (chunk): chunk is Extract<typeof chunk, { type: 'source' }> =>
        chunk.type === 'source',
    )
    .map(chunk => chunk);

  const stepResult: StepResult<any> = {
    content: [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...toolCalls.map(toolCall => ({
        type: 'tool-call' as const,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: JSON.parse(toolCall.input),
        dynamic: true as const,
      })),
    ],
    text,
    reasoning: reasoning.map(chunk => ({
      type: 'reasoning' as const,
      text: chunk.delta,
    })),
    reasoningText: reasoningText || undefined,
    files,
    sources,
    toolCalls: toolCalls.map(toolCall => ({
      type: 'tool-call' as const,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input: JSON.parse(toolCall.input),
      dynamic: true as const,
    })),
    staticToolCalls: [],
    dynamicToolCalls: toolCalls.map(toolCall => ({
      type: 'tool-call' as const,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input: JSON.parse(toolCall.input),
      dynamic: true as const,
    })),
    toolResults: [],
    staticToolResults: [],
    dynamicToolResults: [],
    finishReason: normalizeFinishReason(finish?.finishReason),
    usage: (finish?.usage || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputTokenDetails: { cacheCreation: 0, cacheRead: 0 },
      outputTokenDetails: { reasoning: 0 },
    }) as any,
    warnings: streamStart?.warnings as any,
    request: {
      body: JSON.stringify({
        prompt: conversationPrompt,
        tools: toolCalls.map(toolCall => ({
          type: 'tool-call' as const,
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          input: JSON.parse(toolCall.input),
          dynamic: true as const,
        })),
      }),
    },
    response: {
      id: responseMetadata?.id ?? 'unknown',
      timestamp: responseMetadata?.timestamp ?? new Date(),
      modelId: responseMetadata?.modelId ?? 'unknown',
      messages: [],
    },
    providerMetadata: finish?.providerMetadata || {},
    rawFinishReason: finish?.finishReason as any,
  };

  return stepResult;
}
