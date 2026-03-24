import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolCall,
  LanguageModelV4ToolChoice,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import {
  type FinishReason,
  gateway,
  type StepResult,
  type StopCondition,
  type ToolChoice,
  type ToolSet,
} from 'ai';
import type {
  ProviderOptions,
  StreamTextTransform,
  TelemetrySettings,
} from './durable-agent.js';
import { recordSpan } from './telemetry.js';
import { uint8ArrayToBase64 } from './to-ui-message-chunk.js';
import type { CompatibleLanguageModel } from './types.js';

export type FinishPart = Extract<LanguageModelV4StreamPart, { type: 'finish' }>;

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
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
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
  tools?: LanguageModelV4CallOptions['tools'],
  options?: DoStreamStepOptions,
) {
  'use step';

  let model: CompatibleLanguageModel;
  if (typeof modelInit === 'string') {
    model = gateway(modelInit) as CompatibleLanguageModel;
  } else if (typeof modelInit === 'function') {
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

  const result = await recordSpan({
    name: 'ai.streamText.doStream',
    telemetry: options?.experimental_telemetry,
    attributes: {
      'ai.model.provider': model.provider,
      'ai.model.id': model.modelId,
      'gen_ai.system': model.provider,
      'gen_ai.request.model': model.modelId,
      ...(options?.maxOutputTokens !== undefined && {
        'gen_ai.request.max_tokens': options.maxOutputTokens,
      }),
      ...(options?.temperature !== undefined && {
        'gen_ai.request.temperature': options.temperature,
      }),
      ...(options?.topP !== undefined && {
        'gen_ai.request.top_p': options.topP,
      }),
      ...(options?.topK !== undefined && {
        'gen_ai.request.top_k': options.topK,
      }),
      ...(options?.frequencyPenalty !== undefined && {
        'gen_ai.request.frequency_penalty': options.frequencyPenalty,
      }),
      ...(options?.presencePenalty !== undefined && {
        'gen_ai.request.presence_penalty': options.presencePenalty,
      }),
      ...(options?.stopSequences !== undefined && {
        'gen_ai.request.stop_sequences': options.stopSequences,
      }),
    },
    fn: () => model!.doStream(callOptions),
  });

  let finish: FinishPart | undefined;
  const toolCalls: LanguageModelV4ToolCall[] = [];
  const providerExecutedToolResults = new Map<
    string,
    ProviderExecutedToolResult
  >();
  const chunks: LanguageModelV4StreamPart[] = [];

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
            tools: {} as ToolSet,
            stopStream,
          }),
        );
      }
    }
  }

  // Consume the stream: capture tool calls, finish metadata, and raw chunks
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;

      if (chunk.type === 'tool-call') {
        toolCalls.push({
          ...chunk,
          input: chunk.input || '{}',
        });
      } else if (chunk.type === 'tool-result') {
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
    }
  } finally {
    reader.releaseLock();
  }

  const step = chunksToStep(chunks, toolCalls, conversationPrompt, finish);
  return {
    toolCalls,
    finish,
    step,
    chunks,
    providerExecutedToolResults,
  };
}

// This is a stand-in for logic in the AI-SDK streamText code which aggregates
// chunks into a single step result.
function chunksToStep(
  chunks: LanguageModelV4StreamPart[],
  toolCalls: LanguageModelV4ToolCall[],
  conversationPrompt: LanguageModelV4Prompt,
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

  const rawFinishReason = finish?.finishReason?.raw;

  const stepResult: StepResult<any> = {
    callId: 'durable-agent', // Placeholder; DurableAgent doesn't use multi-call IDs
    stepNumber: 0, // Will be overridden by the caller
    model: {
      provider: responseMetadata?.modelId?.split(':')[0] ?? 'unknown',
      modelId: responseMetadata?.modelId ?? 'unknown',
    },
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
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
    finishReason: finish?.finishReason?.unified ?? 'other',
    rawFinishReason,
    usage: finish?.usage
      ? {
          inputTokens: finish.usage.inputTokens?.total ?? 0,
          inputTokenDetails: {
            noCacheTokens: finish.usage.inputTokens?.noCache,
            cacheReadTokens: finish.usage.inputTokens?.cacheRead,
            cacheWriteTokens: finish.usage.inputTokens?.cacheWrite,
          },
          outputTokens: finish.usage.outputTokens?.total ?? 0,
          outputTokenDetails: {
            textTokens: finish.usage.outputTokens?.text,
            reasoningTokens: finish.usage.outputTokens?.reasoning,
          },
          totalTokens:
            (finish.usage.inputTokens?.total ?? 0) +
            (finish.usage.outputTokens?.total ?? 0),
        }
      : {
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
    warnings: streamStart?.warnings,
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
  };

  return stepResult;
}
