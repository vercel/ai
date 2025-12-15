import {
  type UIMessage,
  type UIMessageChunk,
  convertToModelMessages,
  type ChatTransport,
  type ChatRequestOptions,
  type ModelMessage,
  type ToolResultPart,
  type ToolCallPart,
  type AssistantContent,
  type UserContent,
} from 'ai';

/**
 * LangChain message content block types that represent standard content.
 */
export interface LangChainContentBlock {
  type: string;
  text?: string;
  reasoning?: string;
  data?: string | Uint8Array;
  mimeType?: string;
  id?: string;
  args?: Record<string, unknown>;
  name?: string;
}

/**
 * LangChain tool call structure.
 */
export interface LangChainToolCall {
  type: 'tool_call';
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * LangChain tool call chunk structure for streaming.
 */
export interface LangChainToolCallChunk {
  index?: number;
  id?: string;
  name?: string;
  args?: string;
}

/**
 * LangChain BaseMessage interface.
 */
export interface LangChainBaseMessage {
  id?: string;
  content: string | LangChainContentBlock[];
  name?: string;
  additional_kwargs?: Record<string, unknown>;
}

/**
 * LangChain BaseMessageChunk interface for streaming.
 */
export interface LangChainBaseMessageChunk extends LangChainBaseMessage {
  contentBlocks?: LangChainContentBlock[];
  text?: string;
  tool_call_chunks?: LangChainToolCallChunk[];
  tool_calls?: LangChainToolCall[];
}

/**
 * LangChain AIMessage class interface.
 */
export interface LangChainAIMessage extends LangChainBaseMessage {
  tool_calls?: LangChainToolCall[];
}

/**
 * LangChain AIMessageChunk class interface for streaming.
 */
export interface LangChainAIMessageChunk extends LangChainBaseMessageChunk {
  tool_call_chunks?: LangChainToolCallChunk[];
  tool_calls?: LangChainToolCall[];
}

/**
 * LangChain ToolMessage class interface.
 */
export interface LangChainToolMessage extends LangChainBaseMessage {
  tool_call_id: string;
  status?: 'success' | 'error';
}

/**
 * LangChain HumanMessage class interface.
 */
export interface LangChainHumanMessage extends LangChainBaseMessage {}

/**
 * LangChain SystemMessage class interface.
 */
export interface LangChainSystemMessage extends LangChainBaseMessage {}

/**
 * Factory function type for creating LangChain ToolMessage objects.
 */
export type ToolMessageFactory = (params: {
  tool_call_id: string;
  name?: string;
  status: 'success' | 'error';
  content: string | LangChainContentBlock[] | undefined;
}) => LangChainToolMessage;

/**
 * Factory function type for creating LangChain AIMessage objects.
 */
export type AIMessageFactory = (params: {
  content: string | LangChainContentBlock[];
  tool_calls?: LangChainToolCall[];
}) => LangChainAIMessage;

/**
 * Factory function type for creating LangChain SystemMessage objects.
 */
export type SystemMessageFactory = (params: {
  content: string;
}) => LangChainSystemMessage;

/**
 * Factory function type for creating LangChain HumanMessage objects.
 */
export type HumanMessageFactory = (params: {
  content: string | LangChainContentBlock[];
}) => LangChainHumanMessage;

/**
 * Message factory functions for creating LangChain message objects.
 */
export interface MessageFactories {
  ToolMessage: ToolMessageFactory;
  AIMessage: AIMessageFactory;
  SystemMessage: SystemMessageFactory;
  HumanMessage: HumanMessageFactory;
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
 * Helper to check if a content item is a ToolCallPart
 */
function isToolCallPart(item: unknown): item is ToolCallPart {
  return (
    item != null &&
    typeof item === 'object' &&
    'type' in item &&
    (item as { type: string }).type === 'tool-call'
  );
}

/**
 * Converts a ToolResultPart to a LangChain ToolMessage
 */
function convertToolResultPart(
  block: ToolResultPart,
  factories: MessageFactories,
): LangChainToolMessage {
  return factories.ToolMessage({
    tool_call_id: block.toolCallId,
    name: block.toolName,
    status: (() => {
      if (
        block.output.type === 'error-json' ||
        block.output.type === 'error-text'
      ) {
        return 'error';
      }
      return 'success';
    })(),
    content: (() => {
      if (
        block.output.type === 'text' ||
        block.output.type === 'error-text'
      ) {
        return block.output.value;
      }

      if (block.output.type === 'json' || block.output.type === 'error-json') {
        return JSON.stringify(block.output.value);
      }

      if (block.output.type === 'content') {
        return block.output.value.flatMap(
          (outputBlock): LangChainContentBlock | LangChainContentBlock[] => {
            if (outputBlock.type === 'text') {
              return { type: 'text', text: outputBlock.text };
            }

            if (outputBlock.type === 'media') {
              return {
                type: 'image',
                data: outputBlock.data,
                mimeType: outputBlock.mediaType,
              };
            }

            return [];
          },
        );
      }

      return undefined;
    })(),
  });
}

/**
 * Converts AssistantContent to LangChain content format
 */
function convertAssistantContent(
  content: AssistantContent,
): {
  content: string | LangChainContentBlock[];
  tool_calls?: LangChainToolCall[];
} {
  if (typeof content === 'string') {
    return { content };
  }

  const contentBlocks: LangChainContentBlock[] = [];
  const toolCalls: LangChainToolCall[] = [];

  for (const part of content) {
    if (part.type === 'text') {
      contentBlocks.push({ type: 'text', text: part.text });
    } else if (part.type === 'reasoning') {
      contentBlocks.push({ type: 'reasoning', reasoning: part.text });
    } else if (part.type === 'file') {
      contentBlocks.push({
        type: 'file',
        data: part.data as string | Uint8Array,
        mimeType: part.mediaType,
      });
    } else if (part.type === 'tool-call') {
      contentBlocks.push({
        type: 'tool_call',
        id: part.toolCallId,
        args: part.input as Record<string, unknown>,
        name: part.toolName,
      });
      toolCalls.push({
        type: 'tool_call',
        id: part.toolCallId,
        name: part.toolName,
        args: part.input as Record<string, unknown>,
      });
    }
    // Skip tool-result and tool-approval-request as they're handled separately
  }

  return {
    content: contentBlocks.length > 0 ? contentBlocks : '',
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

/**
 * Converts UserContent to LangChain content format
 */
function convertUserContent(
  content: UserContent,
): string | LangChainContentBlock[] {
  if (typeof content === 'string') {
    return content;
  }

  return content.flatMap(
    (part): LangChainContentBlock | LangChainContentBlock[] => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      }

      if (part.type === 'file') {
        return {
          type: 'file',
          data: part.data as string | Uint8Array,
          mimeType: part.mediaType,
        };
      }

      if (part.type === 'image') {
        return {
          type: 'image',
          data: part.image as string | Uint8Array,
          mimeType: part.mediaType ?? 'image/png',
        };
      }

      return [];
    },
  );
}

/**
 * Converts AI SDK UIMessages to LangChain BaseMessage objects.
 *
 * This function transforms the AI SDK's message format into LangChain's message
 * format, enabling seamless integration between the two frameworks.
 *
 * @param messages - Array of AI SDK UIMessage objects to convert.
 * @param factories - Factory functions for creating LangChain message objects.
 * @returns Promise resolving to an array of LangChain BaseMessage objects.
 *
 * @example
 * ```ts
 * import { AIMessage, ToolMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
 *
 * const baseMessages = await toBaseMessage(uiMessages, {
 *   ToolMessage: (params) => new ToolMessage(params),
 *   AIMessage: (params) => new AIMessage(params),
 *   SystemMessage: (params) => new SystemMessage(params),
 *   HumanMessage: (params) => new HumanMessage(params),
 * });
 * ```
 */
export async function toBaseMessage(
  messages: UIMessage[],
  factories: MessageFactories,
): Promise<LangChainBaseMessage[]> {
  const modelMessages = await convertToModelMessages(messages);

  return convertModelMessages(modelMessages, factories);
}

/**
 * Converts ModelMessages to LangChain BaseMessage objects.
 *
 * @param modelMessages - Array of ModelMessage objects from convertToModelMessages.
 * @param factories - Factory functions for creating LangChain message objects.
 * @returns Array of LangChain BaseMessage objects.
 */
export function convertModelMessages(
  modelMessages: ModelMessage[],
  factories: MessageFactories,
): LangChainBaseMessage[] {
  const result: LangChainBaseMessage[] = [];

  for (const message of modelMessages) {
    switch (message.role) {
      case 'tool': {
        // Tool messages contain an array of tool results
        for (const item of message.content) {
          if (isToolResultPart(item)) {
            result.push(convertToolResultPart(item, factories));
          }
        }
        break;
      }

      case 'assistant': {
        const { content, tool_calls } = convertAssistantContent(message.content);
        result.push(
          factories.AIMessage({
            content,
            tool_calls,
          }),
        );
        break;
      }

      case 'system': {
        result.push(
          factories.SystemMessage({
            content: message.content,
          }),
        );
        break;
      }

      case 'user': {
        result.push(
          factories.HumanMessage({
            content: convertUserContent(message.content),
          }),
        );
        break;
      }
    }
  }

  return result;
}

/**
 * Type guard to check if a message is an AIMessageChunk.
 */
function isAIMessageChunk(
  msg: LangChainBaseMessageChunk,
): msg is LangChainAIMessageChunk {
  return (
    'tool_call_chunks' in msg ||
    'tool_calls' in msg ||
    'text' in msg ||
    (msg.contentBlocks !== undefined &&
      msg.contentBlocks.some(
        block => block.type === 'text' || block.type === 'reasoning',
      ))
  );
}

/**
 * Type guard to check if a message is a ToolMessage.
 */
function isToolMessage(
  msg: LangChainBaseMessageChunk,
): msg is LangChainToolMessage {
  return 'tool_call_id' in msg;
}

/**
 * Converts a LangChain stream to an AI SDK UIMessageStream.
 *
 * This function transforms LangChain's streaming output (from LangGraph or similar)
 * into the AI SDK's UIMessageChunk format for use with the UI components.
 *
 * The stream should emit arrays in the format `[type, data]` or `[namespace, type, data]`
 * where type can be 'custom', 'messages', or 'values'.
 *
 * @param stream - A ReadableStream from LangChain/LangGraph streaming.
 * @returns A ReadableStream of UIMessageChunk objects.
 *
 * @example
 * ```ts
 * const langchainStream = await graph.stream(
 *   { messages: langchainMessages },
 *   { streamMode: ['values', 'messages'] }
 * );
 *
 * const uiStream = toUIMessageStream(langchainStream);
 * ```
 */
export function toUIMessageStream(
  stream: ReadableStream,
): ReadableStream<UIMessageChunk> {
  const messageSeen: Record<
    string,
    { text?: boolean; reasoning?: boolean; tool?: Record<string, boolean> }
  > = {};

  const messageConcat: Record<string, LangChainBaseMessageChunk> = {};

  return stream.pipeThrough(
    new TransformStream<unknown, UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start' });
      },
      transform(event, ctrl) {
        if (!Array.isArray(event)) {
          ctrl.error(
            new Error(
              "Expected event to be an array. Make sure to pass streamMode: ['values', 'messages'] when calling `graph.stream()`",
            ),
          );
          return;
        }

        const [type, data] = event.length === 3 ? event.slice(1) : event;

        switch (type) {
          case 'custom': {
            ctrl.enqueue({
              type: `data-${type}` as 'data-custom',
              transient: true,
              data,
            });
            break;
          }

          case 'messages': {
            const [rawMsg] = data;

            const msg: LangChainBaseMessageChunk | undefined = rawMsg;

            if (!msg?.id) return;

            // Accumulate message chunks for later reference
            if (messageConcat[msg.id]) {
              // Merge the chunks - simplified version
              const existing = messageConcat[msg.id];
              if (msg.tool_call_chunks && isAIMessageChunk(existing)) {
                existing.tool_call_chunks = existing.tool_call_chunks || [];
                for (const chunk of msg.tool_call_chunks) {
                  const idx = chunk.index ?? 0;
                  if (!existing.tool_call_chunks[idx]) {
                    existing.tool_call_chunks[idx] = { ...chunk };
                  } else {
                    const existingChunk = existing.tool_call_chunks[idx];
                    if (chunk.id) existingChunk.id = chunk.id;
                    if (chunk.name) existingChunk.name = chunk.name;
                    if (chunk.args) {
                      existingChunk.args =
                        (existingChunk.args || '') + chunk.args;
                    }
                  }
                }
              }
              // Also accumulate final tool_calls when they arrive
              if (msg.tool_calls && isAIMessageChunk(existing)) {
                existing.tool_calls = msg.tool_calls;
              }
            } else {
              messageConcat[msg.id] = { ...msg };
            }

            if (isAIMessageChunk(msg)) {
              const concatChunk = messageConcat[
                msg.id
              ] as LangChainAIMessageChunk;

              // Handle tool call chunks for streaming tool calls
              if (msg.tool_call_chunks?.length) {
                for (const toolCallChunk of msg.tool_call_chunks) {
                  const idx = toolCallChunk.index ?? 0;
                  const toolCallId =
                    toolCallChunk.id ||
                    concatChunk?.tool_call_chunks?.[idx]?.id ||
                    `unknown`;

                  const toolName =
                    toolCallChunk.name ||
                    concatChunk?.tool_call_chunks?.[idx]?.name ||
                    `unknown`;

                  if (toolCallChunk.args) {
                    if (!messageSeen[msg.id]?.tool?.[toolCallId]) {
                      ctrl.enqueue({
                        type: 'tool-input-start',
                        toolCallId: toolCallId,
                        toolName: toolName,
                      });

                      messageSeen[msg.id] ??= {};
                      messageSeen[msg.id].tool ??= {};
                      messageSeen[msg.id].tool![toolCallId] = true;
                    }

                    ctrl.enqueue({
                      type: 'tool-input-delta',
                      toolCallId: toolCallId,
                      inputTextDelta: toolCallChunk.args,
                    });
                  }
                }

                return;
              }

              // Handle reasoning content blocks
              const reasoning = (msg.contentBlocks ?? []).filter(
                (
                  block,
                ): block is LangChainContentBlock & { type: 'reasoning' } =>
                  block.type === 'reasoning',
              );

              if (reasoning.length) {
                for (const block of reasoning) {
                  if (!messageSeen[msg.id]?.reasoning) {
                    ctrl.enqueue({ type: 'reasoning-start', id: msg.id });
                    messageSeen[msg.id] ??= {};
                    messageSeen[msg.id].reasoning = true;
                  }

                  ctrl.enqueue({
                    type: 'reasoning-delta',
                    delta: block.reasoning ?? '',
                    id: msg.id,
                  });
                }
              }

              // Handle text content
              if (msg.text) {
                if (!messageSeen[msg.id]?.text) {
                  ctrl.enqueue({ type: 'text-start', id: msg.id });
                  messageSeen[msg.id] ??= {};
                  messageSeen[msg.id].text = true;
                }

                ctrl.enqueue({
                  type: 'text-delta',
                  delta: msg.text,
                  id: msg.id,
                });
              }
            } else if (isToolMessage(msg as LangChainBaseMessageChunk)) {
              const toolMsg = msg as LangChainToolMessage;
              ctrl.enqueue({
                type: 'tool-output-available',
                toolCallId: toolMsg.tool_call_id,
                output: toolMsg.content,
              });
            }

            return;
          }

          case 'values': {
            // Finalize all pending message chunks
            for (const [id, seen] of Object.entries(messageSeen)) {
              if (seen.text) ctrl.enqueue({ type: 'text-end', id });
              if (seen.tool) {
                for (const [toolCallId, toolCallSeen] of Object.entries(
                  seen.tool,
                )) {
                  const concatMsg = messageConcat[id];
                  const toolCall = isAIMessageChunk(concatMsg)
                    ? concatMsg.tool_calls?.find(call => call.id === toolCallId)
                    : undefined;

                  if (toolCallSeen && toolCall) {
                    ctrl.enqueue({
                      type: 'tool-input-available',
                      toolCallId,
                      toolName: toolCall.name,
                      input: toolCall.args,
                    });
                  }
                }
              }

              if (seen.reasoning) ctrl.enqueue({ type: 'reasoning-end', id });

              delete messageSeen[id];
              delete messageConcat[id];
            }

            break;
          }
        }
      },
    }),
  );
}

/**
 * Configuration options for the LangSmithDeploymentTransport.
 */
export interface LangSmithDeploymentTransportOptions {
  /**
   * The URL of the LangSmith deployment.
   */
  url: string;

  /**
   * API key for authentication with the LangSmith deployment.
   */
  apiKey?: string;

  /**
   * Optional LangSmith client configuration.
   */
  client?: unknown;

  /**
   * Optional headers to include in requests.
   */
  headers?: Record<string, string>;
}

/**
 * Creates a remote graph client for LangSmith deployments.
 * This is a factory function that users must implement based on their LangChain setup.
 */
export type RemoteGraphFactory = (
  options: LangSmithDeploymentTransportOptions,
) => {
  stream: (
    input: { messages: LangChainBaseMessage[] },
    options?: { streamMode?: string[] },
  ) => Promise<ReadableStream>;
};

/**
 * A ChatTransport implementation for LangSmith/LangGraph deployments.
 *
 * This transport enables seamless integration between the AI SDK's useChat hook
 * and LangSmith deployed LangGraph agents.
 *
 * @example
 * ```ts
 * import { RemoteGraph } from '@langchain/langgraph/remote';
 * import { AIMessage, ToolMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
 *
 * const transport = new LangSmithDeploymentTransport(
 *   { url: 'https://my-deployment.langsmith.app', apiKey: 'my-api-key' },
 *   (options) => new RemoteGraph({ url: options.url, apiKey: options.apiKey }),
 *   {
 *     ToolMessage: (params) => new ToolMessage(params),
 *     AIMessage: (params) => new AIMessage(params),
 *     SystemMessage: (params) => new SystemMessage(params),
 *     HumanMessage: (params) => new HumanMessage(params),
 *   }
 * );
 *
 * // Use with useChat
 * const { messages, input, handleSubmit } = useChat({
 *   transport,
 * });
 * ```
 */
export class LangSmithDeploymentTransport<UI_MESSAGE extends UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  protected graph: ReturnType<RemoteGraphFactory>;
  protected factories: MessageFactories;

  constructor(
    options: LangSmithDeploymentTransportOptions,
    createRemoteGraph: RemoteGraphFactory,
    factories: MessageFactories,
  ) {
    this.graph = createRemoteGraph(options);
    this.factories = factories;
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
    const baseMessages = await toBaseMessage(options.messages, this.factories);

    const stream = await this.graph.stream(
      { messages: baseMessages },
      { streamMode: ['values', 'messages'] },
    );

    return toUIMessageStream(stream);
  }

  async reconnectToStream(
    _options: {
      chatId: string;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    throw new Error('Method not implemented.');
  }
}
