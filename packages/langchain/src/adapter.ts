import {
  SystemMessage,
  BaseMessage,
  AIMessageChunk,
} from '@langchain/core/messages';
import {
  type UIMessage,
  type UIMessageChunk,
  convertToModelMessages,
  type ModelMessage,
} from 'ai';
import {
  convertToolResultPart,
  convertAssistantContent,
  convertUserContent,
  processModelChunk,
  processLangGraphEvent,
  isToolResultPart,
} from './utils';
import { type LangGraphEventState } from './types';

/**
 * Converts AI SDK UIMessages to LangChain BaseMessage objects.
 *
 * This function transforms the AI SDK's message format into LangChain's message
 * format, enabling seamless integration between the two frameworks.
 *
 * @param messages - Array of AI SDK UIMessage objects to convert.
 * @returns Promise resolving to an array of LangChain BaseMessage objects.
 *
 * @example
 * ```ts
 * import { toBaseMessages } from '@ai-sdk/langchain';
 *
 * const langchainMessages = await toBaseMessages(uiMessages);
 *
 * // Use with LangChain
 * const response = await model.invoke(langchainMessages);
 * ```
 */
export async function toBaseMessages(
  messages: UIMessage[],
): Promise<BaseMessage[]> {
  const modelMessages = await convertToModelMessages(messages);
  return convertModelMessages(modelMessages);
}

/**
 * Converts ModelMessages to LangChain BaseMessage objects.
 *
 * @param modelMessages - Array of ModelMessage objects from convertToModelMessages.
 * @returns Array of LangChain BaseMessage objects.
 */
export function convertModelMessages(
  modelMessages: ModelMessage[],
): BaseMessage[] {
  const result: BaseMessage[] = [];

  for (const message of modelMessages) {
    switch (message.role) {
      case 'tool': {
        // Tool messages contain an array of tool results
        for (const item of message.content) {
          if (isToolResultPart(item)) {
            result.push(convertToolResultPart(item));
          }
        }
        break;
      }

      case 'assistant': {
        result.push(convertAssistantContent(message.content));
        break;
      }

      case 'system': {
        result.push(new SystemMessage({ content: message.content }));
        break;
      }

      case 'user': {
        result.push(convertUserContent(message.content));
        break;
      }
    }
  }

  return result;
}

/**
 * Converts a LangChain stream to an AI SDK UIMessageStream.
 *
 * This function automatically detects the stream type and handles both:
 * - Direct model streams (AsyncIterable from `model.stream()`)
 * - LangGraph streams (ReadableStream with `streamMode: ['values', 'messages']`)
 *
 * @param stream - A stream from LangChain model.stream() or LangGraph graph.stream().
 * @returns A ReadableStream of UIMessageChunk objects.
 *
 * @example
 * ```ts
 * // With a direct model stream
 * const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
 * const stream = await model.stream(messages);
 * return createUIMessageStreamResponse({
 *   stream: toUIMessageStream(stream),
 * });
 *
 * // With a LangGraph stream
 * const graphStream = await graph.stream(
 *   { messages },
 *   { streamMode: ['values', 'messages'] }
 * );
 * return createUIMessageStreamResponse({
 *   stream: toUIMessageStream(graphStream),
 * });
 * ```
 */
export function toUIMessageStream(
  stream: AsyncIterable<AIMessageChunk> | ReadableStream,
): ReadableStream<UIMessageChunk> {
  /**
   * State for model stream handling
   */
  const modelState = {
    started: false,
    messageId: 'langchain-msg-1',
    reasoningStarted: false,
    textStarted: false,
  };

  /**
   * State for LangGraph stream handling
   */
  const langGraphState: LangGraphEventState = {
    messageSeen: {} as Record<
      string,
      { text?: boolean; reasoning?: boolean; tool?: Record<string, boolean> }
    >,
    messageConcat: {} as Record<string, AIMessageChunk>,
    emittedToolCalls: new Set<string>(),
    emittedImages: new Set<string>(),
    emittedReasoningIds: new Set<string>(),
    messageReasoningIds: {} as Record<string, string>,
    toolCallInfoByIndex: {} as Record<
      string,
      Record<number, { id: string; name: string }>
    >,
    currentStep: null as number | null,
    emittedToolCallsByKey: new Map<string, string>(),
  };

  /**
   * Track detected stream type: null = not yet detected
   */
  let streamType: 'model' | 'langgraph' | null = null;

  /**
   * Get async iterator from the stream (works for both AsyncIterable and ReadableStream)
   */
  const getAsyncIterator = (): AsyncIterator<unknown> => {
    if (Symbol.asyncIterator in stream) {
      return (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    }
    /**
     * For ReadableStream without Symbol.asyncIterator
     */
    const reader = (stream as ReadableStream).getReader();
    return {
      async next() {
        const { done, value } = await reader.read();
        return { done, value };
      },
    };
  };

  const iterator = getAsyncIterator();

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      controller.enqueue({ type: 'start' });

      try {
        while (true) {
          const { done, value } = await iterator.next();
          if (done) break;

          /**
           * Detect stream type on first value
           */
          if (streamType === null) {
            if (Array.isArray(value)) {
              streamType = 'langgraph';
            } else {
              streamType = 'model';
            }
          }

          /**
           * Process based on detected type
           */
          if (streamType === 'model') {
            processModelChunk(value as AIMessageChunk, modelState, controller);
          } else {
            processLangGraphEvent(
              value as unknown[],
              langGraphState,
              controller,
            );
          }
        }

        /**
         * Finalize based on stream type
         */
        if (streamType === 'model') {
          if (modelState.reasoningStarted) {
            controller.enqueue({
              type: 'reasoning-end',
              id: modelState.messageId,
            });
          }
          if (modelState.textStarted) {
            controller.enqueue({ type: 'text-end', id: modelState.messageId });
          }
          controller.enqueue({ type: 'finish' });
        }
      } catch (error) {
        controller.enqueue({
          type: 'error',
          errorText: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        controller.close();
      }
    },
  });
}
