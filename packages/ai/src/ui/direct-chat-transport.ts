import { Output } from '../generate-text/output';
import { UIMessageStreamOptions } from '../generate-text/stream-text-result';
import { ToolSet } from '../generate-text/tool-set';
import { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import { Agent } from '../agent/agent';
import { ChatTransport } from './chat-transport';
import { convertToModelMessages } from './convert-to-model-messages';
import { InferUITools, UIMessage } from './ui-messages';
import { validateUIMessages } from './validate-ui-messages';

export type DirectPrepareSendMessagesRequest<
  CALL_OPTIONS,
  UI_MESSAGE extends UIMessage,
> = (options: {
  id: string;
  messages: UI_MESSAGE[];
  requestMetadata: unknown;
  agentOptions: CALL_OPTIONS | undefined;
  trigger: 'submit-message' | 'regenerate-message';
  messageId: string | undefined;
}) =>
  | {
      messages?: UI_MESSAGE[];
      agentOptions?: CALL_OPTIONS;
    }
  | PromiseLike<{
      messages?: UI_MESSAGE[];
      agentOptions?: CALL_OPTIONS;
    }>;

/**
 * Options for the `DirectChatTransport` class.
 */
export type DirectChatTransportOptions<
  CALL_OPTIONS,
  TOOLS extends ToolSet,
  OUTPUT extends Output,
  UI_MESSAGE extends UIMessage<unknown, never, InferUITools<TOOLS>>,
> = {
  /**
   * The agent to use for generating responses.
   */
  agent: Agent<CALL_OPTIONS, TOOLS, OUTPUT>;

  /**
   * Options to pass to the agent when calling it.
   */
  options?: CALL_OPTIONS;

  /**
   * When a function is provided, it will be used
   * to prepare the request before calling the agent. This can be useful for
   * customizing the messages or agent options based on context.
   *
   * @param id The id of the chat.
   * @param messages The current messages in the chat.
   * @param requestMetadata The metadata passed with the request.
   * @param agentOptions The current agent options.
   * @param trigger The trigger for this request.
   * @param messageId The id of the message being regenerated (if applicable).
   */
  prepareSendMessagesRequest?: DirectPrepareSendMessagesRequest<
    CALL_OPTIONS,
    UI_MESSAGE
  >;
} & Omit<UIMessageStreamOptions<UI_MESSAGE>, 'onFinish'>;

/**
 * A transport that directly communicates with an Agent in-process,
 * without going through HTTP. This is useful for:
 * - Server-side rendering scenarios
 * - Testing without network
 * - Single-process applications
 *
 * @example
 * ```tsx
 * import { useChat } from '@ai-sdk/react';
 * import { DirectChatTransport } from 'ai';
 * import { myAgent } from './my-agent';
 *
 * const { messages, sendMessage } = useChat({
 *   transport: new DirectChatTransport({ agent: myAgent }),
 * });
 * ```
 */
export class DirectChatTransport<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
  UI_MESSAGE extends UIMessage<unknown, never, InferUITools<TOOLS>> = UIMessage<
    unknown,
    never,
    InferUITools<TOOLS>
  >,
> implements ChatTransport<UI_MESSAGE>
{
  private readonly agent: Agent<CALL_OPTIONS, TOOLS, OUTPUT>;
  private readonly agentOptions: CALL_OPTIONS | undefined;
  private readonly prepareSendMessagesRequest:
    | DirectPrepareSendMessagesRequest<CALL_OPTIONS, UI_MESSAGE>
    | undefined;
  private readonly uiMessageStreamOptions: Omit<
    UIMessageStreamOptions<UI_MESSAGE>,
    'onFinish'
  >;

  constructor({
    agent,
    options,
    prepareSendMessagesRequest,
    ...uiMessageStreamOptions
  }: DirectChatTransportOptions<CALL_OPTIONS, TOOLS, OUTPUT, UI_MESSAGE>) {
    this.agent = agent;
    this.agentOptions = options;
    this.prepareSendMessagesRequest = prepareSendMessagesRequest;
    this.uiMessageStreamOptions = uiMessageStreamOptions;
  }

  async sendMessages({
    messages,
    abortSignal,
    chatId,
    metadata,
    trigger,
    messageId,
  }: Parameters<ChatTransport<UI_MESSAGE>['sendMessages']>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    // Allow customization of messages and agent options
    const preparedRequest = await this.prepareSendMessagesRequest?.({
      id: chatId,
      messages,
      requestMetadata: metadata,
      agentOptions: this.agentOptions,
      trigger,
      messageId,
    });

    const finalMessages = preparedRequest?.messages ?? messages;
    const finalAgentOptions = preparedRequest?.agentOptions ?? this.agentOptions;

    // Validate the incoming UI messages
    const validatedMessages = await validateUIMessages<UI_MESSAGE>({
      messages: finalMessages,
      tools: this.agent.tools,
    });

    // Convert UI messages to model messages
    const modelMessages = await convertToModelMessages(validatedMessages, {
      tools: this.agent.tools,
    });

    // Stream options for agent
    const streamOptions = {
      prompt: modelMessages,
      abortSignal,
      ...(finalAgentOptions !== undefined ? { options: finalAgentOptions } : {}),
    };

    const result = await this.agent.stream(streamOptions);

    // Return the UI message stream
    return result.toUIMessageStream(this.uiMessageStreamOptions);
  }

  /**
   * Direct transport does not support reconnection since there is no
   * persistent server-side stream to reconnect to.
   *
   * @returns Always returns `null`
   */
  async reconnectToStream(
    _options: Parameters<ChatTransport<UI_MESSAGE>['reconnectToStream']>[0],
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
