import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  BaseMessage,
  AIMessageChunk,
  BaseMessageChunk,
  ToolCallChunk
} from '@langchain/core/messages';
import {
  type UIMessage,
  type UIMessageChunk,
  convertToModelMessages,
  type ChatTransport,
  type ChatRequestOptions,
  type ModelMessage,
  type ToolResultPart,
  type AssistantContent,
  type UserContent,
} from 'ai';
import { RemoteGraph, type RemoteGraphParams } from '@langchain/langgraph/remote';

/**
 * Converts a ToolResultPart to a LangChain ToolMessage
 */
function convertToolResultPart(block: ToolResultPart): ToolMessage {
  const content = (() => {
    if (block.output.type === 'text' || block.output.type === 'error-text') {
      return block.output.value;
    }

    if (block.output.type === 'json' || block.output.type === 'error-json') {
      return JSON.stringify(block.output.value);
    }

    if (block.output.type === 'content') {
      return block.output.value
        .map(outputBlock => {
          if (outputBlock.type === 'text') {
            return outputBlock.text;
          }
          return '';
        })
        .join('');
    }

    return '';
  })();

  return new ToolMessage({
    tool_call_id: block.toolCallId,
    content,
  });
}

/**
 * Converts AssistantContent to LangChain AIMessage
 */
function convertAssistantContent(content: AssistantContent): AIMessage {
  if (typeof content === 'string') {
    return new AIMessage({ content });
  }

  const textParts: string[] = [];
  const toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }> = [];

  for (const part of content) {
    if (part.type === 'text') {
      textParts.push(part.text);
    } else if (part.type === 'tool-call') {
      toolCalls.push({
        id: part.toolCallId,
        name: part.toolName,
        args: part.input as Record<string, unknown>,
      });
    }
  }

  return new AIMessage({
    content: textParts.join(''),
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  });
}

/**
 * Converts UserContent to LangChain HumanMessage
 */
function convertUserContent(content: UserContent): HumanMessage {
  if (typeof content === 'string') {
    return new HumanMessage({ content });
  }

  const textParts = content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text);

  return new HumanMessage({ content: textParts.join('') });
}

/**
 * Helper to check if a content item is a ToolResultPart
 */
function isToolResultPart(item: unknown): item is ToolResultPart {
  return (
    item != null &&
    typeof item === 'object' &&
    'type' in item &&
    (item as { type: string }).type === 'tool-result'
  );
}

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
 * Processes a model stream chunk and emits UI message chunks.
 */
function processModelChunk(
  chunk: AIMessageChunk,
  state: { started: boolean; messageId: string },
  controller: ReadableStreamDefaultController<UIMessageChunk>,
): void {
  // Get the message ID from the chunk if available
  if (chunk.id) {
    state.messageId = chunk.id;
  }

  // Extract text content from AIMessageChunk
  const text =
    typeof chunk.content === 'string'
      ? chunk.content
      : Array.isArray(chunk.content)
        ? chunk.content
            .filter(
              (c): c is { type: 'text'; text: string } =>
                typeof c === 'object' &&
                c !== null &&
                'type' in c &&
                c.type === 'text',
            )
            .map(c => c.text)
            .join('')
        : '';

  if (text) {
    if (!state.started) {
      controller.enqueue({ type: 'text-start', id: state.messageId });
      state.started = true;
    }
    controller.enqueue({
      type: 'text-delta',
      delta: text,
      id: state.messageId,
    });
  }
}

/**
 * Checks if a message is a plain object (not a LangChain class instance).
 * LangChain class instances have a _getType method.
 */
function isPlainMessageObject(msg: unknown): boolean {
  if (msg == null || typeof msg !== 'object') return false;
  // LangChain class instances have _getType method
  return typeof (msg as { _getType?: unknown })._getType !== 'function';
}

/**
 * Checks if a message is an AI message chunk (works for both class instances and plain objects).
 * For class instances, only AIMessageChunk is matched (not AIMessage).
 * For plain objects from RemoteGraph API, matches type === 'ai'.
 */
function isAIMessageChunk(
  msg: unknown,
): msg is AIMessageChunk & { type?: string; content?: string } {
  // Actual AIMessageChunk class instance
  if (AIMessageChunk.isInstance(msg)) return true;
  // Plain object from RemoteGraph API (not a LangChain class instance)
  if (isPlainMessageObject(msg)) {
    const obj = msg as Record<string, unknown>;
    return 'type' in obj && obj.type === 'ai';
  }
  return false;
}

/**
 * Checks if a message is a Tool message (works for both class instances and plain objects).
 */
function isToolMessageType(
  msg: unknown,
): msg is ToolMessage & { type?: string; tool_call_id?: string } {
  if (ToolMessage.isInstance(msg)) return true;
  // Plain object from RemoteGraph API (not a LangChain class instance)
  if (isPlainMessageObject(msg)) {
    const obj = msg as Record<string, unknown>;
    return 'type' in obj && obj.type === 'tool';
  }
  return false;
}

/**
 * Gets text content from a message (works for both class instances and plain objects).
 */
function getMessageText(msg: unknown): string {
  if (AIMessageChunk.isInstance(msg)) {
    return msg.text ?? '';
  }
  // Handle plain objects - check content property
  if (msg != null && typeof msg === 'object' && 'content' in msg) {
    const content = (msg as { content: unknown }).content;
    return typeof content === 'string' ? content : '';
  }
  return '';
}

/**
 * Processes a LangGraph event and emits UI message chunks.
 */
function processLangGraphEvent(
  event: unknown[],
  state: {
    messageSeen: Record<
      string,
      { text?: boolean; reasoning?: boolean; tool?: Record<string, boolean> }
    >;
    messageConcat: Record<string, AIMessageChunk>;
    emittedToolCalls: Set<string>;
  },
  controller: ReadableStreamDefaultController<UIMessageChunk>,
): void {
  const { messageSeen, messageConcat, emittedToolCalls } = state;
  const [type, data] = event.length === 3 ? event.slice(1) : event;

  switch (type) {
    case 'custom': {
      controller.enqueue({
        type: `data-${type}` as 'data-custom',
        transient: true,
        data,
      });
      break;
    }

    case 'messages': {
      const [rawMsg] = data as [BaseMessageChunk | BaseMessage | undefined];

      const msg = rawMsg;

      if (!msg?.id) return;

      // Accumulate message chunks for later reference
      if (messageConcat[msg.id]) {
        const existing = messageConcat[msg.id];
        if (AIMessageChunk.isInstance(msg)) {
          messageConcat[msg.id] = existing.concat(msg) as AIMessageChunk;
        }
      } else if (AIMessageChunk.isInstance(msg)) {
        messageConcat[msg.id] = msg;
      }

      if (isAIMessageChunk(msg)) {
        const concatChunk = messageConcat[msg.id];

        // Handle tool call chunks for streaming tool calls
        const toolCallChunks = (
          msg as { tool_call_chunks?: ToolCallChunk[] }
        ).tool_call_chunks;
        if (toolCallChunks?.length) {
          for (const toolCallChunk of toolCallChunks) {
            const idx = toolCallChunk.index ?? 0;
            // Get the tool call ID from the chunk or accumulated chunks
            const toolCallId =
              toolCallChunk.id || concatChunk?.tool_call_chunks?.[idx]?.id;

            // Skip if we don't have a proper tool call ID - we'll handle it in values
            if (!toolCallId) {
              continue;
            }

            const toolName =
              toolCallChunk.name ||
              concatChunk?.tool_call_chunks?.[idx]?.name ||
              `unknown`;

            if (toolCallChunk.args) {
              if (!messageSeen[msg.id]?.tool?.[toolCallId]) {
                controller.enqueue({
                  type: 'tool-input-start',
                  toolCallId: toolCallId,
                  toolName: toolName,
                });

                messageSeen[msg.id] ??= {};
                messageSeen[msg.id].tool ??= {};
                messageSeen[msg.id].tool![toolCallId] = true;
                emittedToolCalls.add(toolCallId);
              }

              controller.enqueue({
                type: 'tool-input-delta',
                toolCallId: toolCallId,
                inputTextDelta: toolCallChunk.args,
              });
            }
          }

          return;
        }

        // Handle text content
        const text = getMessageText(msg);
        if (text) {
          if (!messageSeen[msg.id]?.text) {
            controller.enqueue({ type: 'text-start', id: msg.id });
            messageSeen[msg.id] ??= {};
            messageSeen[msg.id].text = true;
          }

          controller.enqueue({
            type: 'text-delta',
            delta: text,
            id: msg.id,
          });
        }
      } else if (isToolMessageType(msg)) {
        const toolCallId = (msg as { tool_call_id?: string }).tool_call_id;
        if (toolCallId) {
          controller.enqueue({
            type: 'tool-output-available',
            toolCallId,
            output: (msg as { content?: unknown }).content,
          });
        }
      }

      return;
    }

    case 'values': {
      // Finalize all pending message chunks
      for (const [id, seen] of Object.entries(messageSeen)) {
        if (seen.text) controller.enqueue({ type: 'text-end', id });
        if (seen.tool) {
          for (const [toolCallId, toolCallSeen] of Object.entries(seen.tool)) {
            const concatMsg = messageConcat[id];
            const toolCall = concatMsg?.tool_calls?.find(
              call => call.id === toolCallId,
            );

            if (toolCallSeen && toolCall) {
              emittedToolCalls.add(toolCallId);
              controller.enqueue({
                type: 'tool-input-available',
                toolCallId,
                toolName: toolCall.name,
                input: toolCall.args,
              });
            }
          }
        }

        if (seen.reasoning) controller.enqueue({ type: 'reasoning-end', id });

        delete messageSeen[id];
        delete messageConcat[id];
      }

      // Also check for tool calls in the final state that weren't streamed
      // This handles cases where tool calls appear directly in values without being in messages events
      if (data != null && typeof data === 'object' && 'messages' in data) {
        const messages = (data as { messages?: unknown[] }).messages;
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            if (!msg || typeof msg !== 'object' || !('id' in msg)) continue;

            const msgId = (msg as { id: string }).id;
            if (!msgId) continue;

            // Check if this is an AI message with tool calls
            let toolCalls: Array<{ id: string; name: string; args: unknown }> | undefined;

            // For class instances
            if (AIMessageChunk.isInstance(msg) || AIMessage.isInstance(msg)) {
              toolCalls = (msg as { tool_calls?: Array<{ id: string; name: string; args: unknown }> }).tool_calls;
            }
            // For plain objects from RemoteGraph API
            else if (isPlainMessageObject(msg)) {
              const obj = msg as Record<string, unknown>;
              if (obj.type === 'ai') {
                // Try tool_calls first (normalized format)
                if (Array.isArray(obj.tool_calls)) {
                  toolCalls = obj.tool_calls as { id: string; name: string; args: unknown }[];
                }
                // Fall back to additional_kwargs.tool_calls (OpenAI format)
                else if (obj.additional_kwargs && typeof obj.additional_kwargs === 'object') {
                  const additionalKwargs = obj.additional_kwargs as Record<string, unknown>;
                  if (Array.isArray(additionalKwargs.tool_calls)) {
                    // Convert OpenAI format to normalized format
                    toolCalls = (additionalKwargs.tool_calls as Array<{
                      id?: string;
                      function?: { name?: string; arguments?: string };
                    }>).map((tc, idx) => {
                      const functionData = tc.function;
                      let args: unknown;
                      try {
                        args = functionData?.arguments ? JSON.parse(functionData.arguments) : {};
                      } catch {
                        args = {};
                      }
                      return {
                        id: tc.id || `call_${idx}`,
                        name: functionData?.name || 'unknown',
                        args,
                      };
                    });
                  }
                }
              }
            }

            if (toolCalls && toolCalls.length > 0) {
              for (const toolCall of toolCalls) {
                // Only emit if we haven't already processed this tool call
                if (!emittedToolCalls.has(toolCall.id)) {
                  emittedToolCalls.add(toolCall.id);
                  controller.enqueue({
                    type: 'tool-input-available',
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    input: toolCall.args,
                  });
                }
              }
            }
          }
        }
      }

      break;
    }
  }
}

/**
 * Converts a LangChain stream to an AI SDK UIMessageStream.
 *
 * This function automatically detects the stream type and handles both:
 * - Direct model streams (AsyncIterable from `model.stream()`)
 * - LangGraph streams (ReadableStream with `streamMode: ['values', 'messages']`)
 *
 * Detection is based on the first value in the stream:
 * - If it's an array like `['messages', ...]`, it's a LangGraph stream
 * - If it's an AIMessageChunk object, it's a direct model stream
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
  // State for model stream handling
  const modelState = { started: false, messageId: 'langchain-msg-1' };

  // State for LangGraph stream handling
  const langGraphState = {
    messageSeen: {} as Record<
      string,
      { text?: boolean; reasoning?: boolean; tool?: Record<string, boolean> }
    >,
    messageConcat: {} as Record<string, AIMessageChunk>,
    emittedToolCalls: new Set<string>(),
  };

  // Track detected stream type: null = not yet detected
  let streamType: 'model' | 'langgraph' | null = null;

  // Get async iterator from the stream (works for both AsyncIterable and ReadableStream)
  const getAsyncIterator = (): AsyncIterator<unknown> => {
    if (Symbol.asyncIterator in stream) {
      return (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    }
    // For ReadableStream without Symbol.asyncIterator
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

          // Detect stream type on first value
          if (streamType === null) {
            if (Array.isArray(value)) {
              streamType = 'langgraph';
            } else {
              streamType = 'model';
            }
          }

          // Process based on detected type
          if (streamType === 'model') {
            processModelChunk(
              value as AIMessageChunk,
              modelState,
              controller,
            );
          } else {
            processLangGraphEvent(
              value as unknown[],
              langGraphState,
              controller,
            );
          }
        }

        // Finalize based on stream type
        if (streamType === 'model') {
          if (modelState.started) {
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

/**
 * Options for configuring a LangSmith deployment transport.
 * Extends RemoteGraphParams but makes graphId optional (defaults to 'agent').
 */
export type LangSmithDeploymentTransportOptions = Omit<
  RemoteGraphParams,
  'graphId'
> & {
  /**
   * The ID of the graph to connect to.
   * @default 'agent'
   */
  graphId?: string;
};

/**
 * Internal ChatTransport implementation for LangSmith/LangGraph deployments.
 * Use {@link useLangSmithDeployment} to create an instance.
 */
class LangSmithDeploymentTransport<UI_MESSAGE extends UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  protected graph: RemoteGraph;

  constructor(options: LangSmithDeploymentTransportOptions) {
    this.graph = new RemoteGraph({
      ...options,
      graphId: options.graphId ?? 'agent',
    });
  }

  async sendMessages(
    options: {
      trigger: 'submit-message' | 'regenerate-message';
      chatId: string;
      messageId: string | undefined;
      messages: UI_MESSAGE[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const baseMessages = await toBaseMessages(options.messages);

    const stream = await this.graph.stream(
      { messages: baseMessages },
      { streamMode: ['values', 'messages'] },
    );

    return toUIMessageStream(
      stream as AsyncIterable<AIMessageChunk> | ReadableStream,
    );
  }

  async reconnectToStream(
    _options: {
      chatId: string;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    throw new Error('Method not implemented.');
  }
}

/**
 * A ChatTransport implementation for LangSmith/LangGraph deployments.
 *
 * This transport enables seamless integration between the AI SDK's useChat hook
 * and LangSmith deployed LangGraph agents.
 *
 * @example
 * ```ts
 * import { useLangSmithDeployment } from '@ai-sdk/langchain';
 *
 * // Use with useChat
 * const { messages, input, handleSubmit } = useChat({
 *   transport: useLangSmithDeployment({
 *     url: 'https://your-deployment.us.langgraph.app',
 *     apiKey: 'my-api-key',
 *   }),
 * });
 * ```
 */
export function useLangSmithDeployment<UI_MESSAGE extends UIMessage>(options: LangSmithDeploymentTransportOptions) {
  return new LangSmithDeploymentTransport<UI_MESSAGE>(options);
}