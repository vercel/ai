import type {
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3ToolCall,
} from '@ai-sdk/provider';
import { generateId as defaultGenerateId } from '@ai-sdk/provider-utils';
import { FinishReason } from '../types';
import { LanguageModelUsage } from '../types/usage';
import { ContentPart } from './content-part';
import { DefaultGeneratedFileWithType } from './generated-file';
import type { StepResult } from './step-result';
import { DynamicToolCall } from './tool-call';
import { ToolSet } from './tool-set';

/**
 * The finish part extracted from a LanguageModelV3 stream.
 */
export type StreamFinishPart = Extract<
  LanguageModelV3StreamPart,
  { type: 'finish' }
>;

/**
 * Options for chunksToStepResult.
 */
export interface ChunksToStepResultOptions {
  chunks: LanguageModelV3StreamPart[];
  toolCalls: LanguageModelV3ToolCall[];
  prompt: LanguageModelV3Prompt;
  finish?: StreamFinishPart;
  generateId?: () => string;
}

/**
 * Extract the unified finish reason from a LanguageModelV3FinishReason.
 */
export function normalizeFinishReason(
  finishReason: StreamFinishPart['finishReason'] | undefined,
): FinishReason {
  return finishReason?.unified ?? 'other';
}

/**
 * Aggregates raw LanguageModelV3StreamPart chunks into a StepResult.
 *
 * This is useful for consumers that build custom agent loops on top of
 * the AI SDK and need to reconstruct step results from raw provider
 * stream parts (e.g., DurableAgent in the Vercel Workflow SDK).
 */
export function chunksToStepResult({
  chunks,
  toolCalls,
  prompt,
  finish,
  generateId = defaultGenerateId,
}: ChunksToStepResultOptions): StepResult<ToolSet> {
  // Aggregate text deltas
  const text = chunks
    .filter(
      (chunk): chunk is Extract<typeof chunk, { type: 'text-delta' }> =>
        chunk.type === 'text-delta',
    )
    .map(chunk => chunk.delta)
    .join('');

  // Build content array
  const content: Array<ContentPart<ToolSet>> = [];

  if (text) {
    content.push({ type: 'text' as const, text });
  }

  // Reasoning parts
  const reasoningChunks = chunks.filter(
    (chunk): chunk is Extract<typeof chunk, { type: 'reasoning-delta' }> =>
      chunk.type === 'reasoning-delta',
  );
  for (const chunk of reasoningChunks) {
    content.push({
      type: 'reasoning' as const,
      text: chunk.delta,
      providerMetadata: chunk.providerMetadata,
    });
  }

  // File parts
  const fileChunks = chunks.filter(
    (chunk): chunk is Extract<typeof chunk, { type: 'file' }> =>
      chunk.type === 'file',
  );
  for (const chunk of fileChunks) {
    content.push({
      type: 'file' as const,
      file: new DefaultGeneratedFileWithType({
        data: chunk.data,
        mediaType: chunk.mediaType,
      }),
    });
  }

  // Source parts
  const sourceChunks = chunks.filter(
    (chunk): chunk is Extract<typeof chunk, { type: 'source' }> =>
      chunk.type === 'source',
  );
  for (const chunk of sourceChunks) {
    content.push(chunk);
  }

  // Tool call parts
  const dynamicToolCalls: DynamicToolCall[] = toolCalls.map(toolCall => ({
    type: 'tool-call' as const,
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: JSON.parse(toolCall.input),
    dynamic: true as const,
  }));
  for (const tc of dynamicToolCalls) {
    content.push(tc);
  }

  // Extract metadata from stream
  const streamStart = chunks.find(
    (chunk): chunk is Extract<typeof chunk, { type: 'stream-start' }> =>
      chunk.type === 'stream-start',
  );

  const responseMetadata = chunks.find(
    (chunk): chunk is Extract<typeof chunk, { type: 'response-metadata' }> =>
      chunk.type === 'response-metadata',
  );

  // Build usage
  const usage: LanguageModelUsage = finish?.usage
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
      };

  return {
    callId: generateId(),
    stepNumber: 0,
    model: {
      provider: responseMetadata?.modelId?.split(':')[0] ?? 'unknown',
      modelId: responseMetadata?.modelId ?? 'unknown',
    },
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    content,
    text,
    reasoning: reasoningChunks.map(chunk => ({
      type: 'reasoning' as const,
      text: chunk.delta,
      providerMetadata: chunk.providerMetadata,
    })),
    reasoningText:
      reasoningChunks.length > 0
        ? reasoningChunks.map(chunk => chunk.delta).join('')
        : undefined,
    files: content
      .filter(
        (part): part is Extract<typeof part, { type: 'file' }> =>
          part.type === 'file',
      )
      .map(part => part.file),
    sources: sourceChunks,
    toolCalls: dynamicToolCalls,
    staticToolCalls: [],
    dynamicToolCalls,
    toolResults: [],
    staticToolResults: [],
    dynamicToolResults: [],
    finishReason: normalizeFinishReason(finish?.finishReason),
    rawFinishReason: finish?.finishReason?.raw,
    usage,
    warnings: streamStart?.warnings,
    request: {
      body: JSON.stringify({
        prompt,
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
}
