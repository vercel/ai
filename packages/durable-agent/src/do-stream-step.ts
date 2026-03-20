import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolCall,
  LanguageModelV4ToolChoice,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import {
  gateway,
  generateId,
  type StopCondition,
  type ToolChoice,
  type ToolSet,
  type UIMessageChunk,
} from 'ai';
import { chunksToStepResult, type StreamFinishPart } from 'ai/internal';
import type {
  ProviderOptions,
  StreamTextTransform,
  TelemetrySettings,
} from './durable-agent.js';
import type { CompatibleLanguageModel } from './types.js';

export type { StreamFinishPart as FinishPart };

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
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
  /**
   * If true, collects and returns all UIMessageChunks written to the stream.
   * This is used by DurableAgent when collectUIMessages is enabled.
   */
  collectUIChunks?: boolean;
}

/**
 * Convert AI SDK ToolChoice to LanguageModelV4ToolChoice
 */
function toLanguageModelToolChoice(
  toolChoice: ToolChoice<ToolSet> | undefined,
): LanguageModelV4ToolChoice | undefined {
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
  conversationPrompt: LanguageModelV4Prompt,
  modelInit: string | (() => Promise<CompatibleLanguageModel>),
  writable: WritableStream<UIMessageChunk>,
  tools?: LanguageModelV4CallOptions['tools'],
  options?: DoStreamStepOptions,
) {
  'use step';

  let model: CompatibleLanguageModel | undefined;
  if (typeof modelInit === 'string') {
    model = gateway(modelInit) as CompatibleLanguageModel;
  } else if (typeof modelInit === 'function') {
    // User-provided model factory - returns V4
    model = await modelInit();
  } else {
    throw new Error(
      'Invalid "model initialization" argument. Must be a string or a function that returns a LanguageModel instance.',
    );
  }

  // Build call options with all generation settings
  const callOptions: LanguageModelV4CallOptions = {
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
      providerOptions: options.providerOptions as SharedV4ProviderOptions,
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
  const toolCalls: LanguageModelV4ToolCall[] = [];
  // Map of tool call ID to provider-executed tool result
  const providerExecutedToolResults = new Map<
    string,
    ProviderExecutedToolResult
  >();
  const chunks: LanguageModelV4StreamPart[] = [];
  const includeRawChunks = options?.includeRawChunks ?? false;
  const collectUIChunks = options?.collectUIChunks ?? false;
  const uiChunks: UIMessageChunk[] = [];

  // Build the stream pipeline
  let stream: ReadableStream<LanguageModelV4StreamPart> = result.stream;

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
            // In V4, all tool-result stream parts are provider-executed by definition
            providerExecutedToolResults.set(chunk.toolCallId, {
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              result: chunk.result,
              isError: chunk.isError,
            });
          } else if (chunk.type === 'finish') {
            finish = chunk;
          }
          chunks.push(chunk);
          controller.enqueue(chunk);
        },
      }),
    )
    .pipeThrough(
      new TransformStream<LanguageModelV4StreamPart, UIMessageChunk>({
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

  const step = chunksToStepResult({
    chunks,
    toolCalls,
    prompt: conversationPrompt,
    finish,
  });
  return {
    toolCalls,
    finish,
    step,
    uiChunks: collectUIChunks ? uiChunks : undefined,
    providerExecutedToolResults,
  };
}
