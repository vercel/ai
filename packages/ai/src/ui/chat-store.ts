import {
  generateId as generateIdFunc,
  IdGenerator,
  StandardSchemaV1,
  ToolCall,
  Validator,
} from '@ai-sdk/provider-utils';
import { consumeStream } from '../util/consume-stream';
import { SerialJobExecutor } from '../util/serial-job-executor';
import { ChatTransport } from './chat-transport';
import { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
import { getToolInvocations } from './get-tool-invocations';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  StreamingUIMessageState,
} from './process-ui-message-stream';
import {
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
} from './should-resubmit-messages';
import type {
  CreateUIMessage,
  ToolInvocationUIPart,
  UIDataTypes,
  UIMessage,
} from './ui-messages';
import { ChatRequestOptions, UseChatOptions } from './use-chat';

export interface ChatStoreSubscriber {
  onChatChanged: (event: ChatStoreEvent) => void;
}

export interface ChatStoreEvent {
  type: 'chat-messages-changed' | 'chat-status-changed';
  chatId: number | string;
  error?: Error;
}

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';

export type ActiveResponse<MESSAGE_METADATA> = {
  state: StreamingUIMessageState<MESSAGE_METADATA>;
  abortController: AbortController | undefined;
};

type ExtendedCallOptions<
  MESSAGE_METADATA,
  DATA_TYPES extends UIDataTypes,
> = ChatRequestOptions & {
  onError?: (error: Error) => void;

  /**
Optional callback function that is invoked when a tool call is received.
Intended for automatic client-side tool execution.

You can optionally return a result for the tool call,
either synchronously or asynchronously.
   */
  onToolCall?: ({
    toolCall,
  }: {
    toolCall: ToolCall<string, unknown>;
  }) => void | Promise<unknown> | unknown;

  /**
   * Optional callback function that is called when the assistant message is finished streaming.
   *
   * @param message The message that was streamed.
   */
  onFinish?: (options: {
    message: UIMessage<MESSAGE_METADATA, DATA_TYPES>;
  }) => void;
};

export type UIDataPartSchemas = Record<
  string,
  Validator<any> | StandardSchemaV1<any>
>;

export type InferUIDataParts<T extends UIDataPartSchemas> = {
  [K in keyof T]: T[K] extends Validator<infer U>
    ? U
    : T[K] extends StandardSchemaV1<infer U>
      ? U
      : unknown;
};

export type ChatFactory<
  MESSAGE_METADATA,
  DATA_TYPES extends UIDataTypes,
> = (options: {
  messages?: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
}) => Chat<MESSAGE_METADATA, DATA_TYPES>;

export type ChatStoreOptions<
  MESSAGE_METADATA,
  DATA_PART_SCHEMAS extends UIDataPartSchemas,
> = {
  chats?: {
    [id: string]: {
      messages: UIMessage<
        MESSAGE_METADATA,
        InferUIDataParts<DATA_PART_SCHEMAS>
      >[];
    };
  };
  generateId?: UseChatOptions['generateId'];
  transport: ChatTransport<
    MESSAGE_METADATA,
    InferUIDataParts<DATA_PART_SCHEMAS>
  >;
  maxSteps?: number;
  messageMetadataSchema?:
    | Validator<MESSAGE_METADATA>
    | StandardSchemaV1<MESSAGE_METADATA>;
  dataPartSchemas?: DATA_PART_SCHEMAS;
};

export type ChatStoreFactory<
  MESSAGE_METADATA,
  DATA_PART_SCHEMAS extends UIDataPartSchemas,
> = (
  options: ChatStoreOptions<MESSAGE_METADATA, DATA_PART_SCHEMAS>,
) => ChatStore<MESSAGE_METADATA, DATA_PART_SCHEMAS>;

export interface Chat<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes> {
  readonly status: ChatStatus;
  readonly messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
  readonly error: Error | undefined;
  readonly activeResponse: ActiveResponse<MESSAGE_METADATA> | undefined;
  readonly jobExecutor: SerialJobExecutor;

  setStatus: (status: ChatStatus) => void;
  setError: (error: Error | undefined) => void;
  setActiveResponse: (
    activeResponse: ActiveResponse<MESSAGE_METADATA> | undefined,
  ) => void;
  pushMessage: (message: UIMessage<MESSAGE_METADATA, DATA_TYPES>) => void;
  popMessage: () => void;
  replaceMessage: (
    index: number,
    message: UIMessage<MESSAGE_METADATA, DATA_TYPES>,
  ) => void;
  setMessages: (messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) => void;
  snapshot?: <T>(thing: T) => T;
}

export class ChatStore<
  MESSAGE_METADATA = unknown,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> {
  private chats: Map<
    string,
    Chat<MESSAGE_METADATA, InferUIDataParts<UI_DATA_PART_SCHEMAS>>
  >;
  private readonly createChat: ChatFactory<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  >;
  private subscribers: Set<ChatStoreSubscriber>;
  private generateId: IdGenerator;
  private messageMetadataSchema:
    | Validator<MESSAGE_METADATA>
    | StandardSchemaV1<MESSAGE_METADATA>
    | undefined;
  private dataPartSchemas: UI_DATA_PART_SCHEMAS | undefined;
  private transport: ChatTransport<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  >;
  private maxSteps: number;

  constructor({
    chats = {},
    generateId,
    transport,
    maxSteps = 1,
    messageMetadataSchema,
    dataPartSchemas,
    createChat,
  }: {
    chats?: {
      [id: string]: {
        messages: UIMessage<
          MESSAGE_METADATA,
          InferUIDataParts<UI_DATA_PART_SCHEMAS>
        >[];
      };
    };
    generateId?: UseChatOptions['generateId'];
    transport: ChatTransport<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >;
    maxSteps?: number;
    messageMetadataSchema?:
      | Validator<MESSAGE_METADATA>
      | StandardSchemaV1<MESSAGE_METADATA>;
    dataPartSchemas?: UI_DATA_PART_SCHEMAS;
    createChat: ChatFactory<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >;
  }) {
    this.createChat = createChat;
    this.chats = new Map(
      Object.entries(chats).map(([id, chat]) => [
        id,
        this.createChat({ messages: chat.messages }),
      ]),
    );

    this.maxSteps = maxSteps;
    this.transport = transport;
    this.subscribers = new Set();
    this.generateId = generateId ?? generateIdFunc;
    this.messageMetadataSchema = messageMetadataSchema;
    this.dataPartSchemas = dataPartSchemas;
  }

  hasChat(id: string) {
    return this.chats.has(id);
  }

  addChat(
    id: string,
    messages: UIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >[],
  ) {
    this.chats.set(id, this.createChat({ messages }));
  }

  getChats() {
    return Array.from(this.chats.entries());
  }

  get chatCount() {
    return this.chats.size;
  }

  getStatus(id: string): ChatStatus {
    return this.getChatState(id).status;
  }

  setStatus({
    id,
    status,
    error,
  }: {
    id: string;
    status: ChatStatus;
    error?: Error;
  }) {
    const state = this.getChatState(id);

    if (state.status === status) return;

    state.setStatus(status);
    state.setError(error);

    this.emit({ type: 'chat-status-changed', chatId: id, error });
  }

  getError(id: string) {
    return this.getChatState(id).error;
  }

  getMessages(id: string) {
    return this.getChatState(id).messages;
  }

  getLastMessage(id: string) {
    const chat = this.getChatState(id);
    return chat.messages[chat.messages.length - 1];
  }

  subscribe(subscriber: ChatStoreSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  setMessages({
    id,
    messages,
  }: {
    id: string;
    messages: UIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >[];
  }) {
    this.getChatState(id).setMessages(messages);
    this.emit({ type: 'chat-messages-changed', chatId: id });
  }

  removeAssistantResponse(id: string) {
    const chat = this.getChatState(id);
    const lastMessage = chat.messages[chat.messages.length - 1];

    if (lastMessage == null) {
      throw new Error('Cannot remove assistant response from empty chat');
    }

    if (lastMessage.role !== 'assistant') {
      throw new Error('Last message is not an assistant message');
    }

    chat.popMessage();
    this.emit({ type: 'chat-messages-changed', chatId: id });
  }

  async submitMessage({
    chatId,
    message,
    headers,
    body,
    onError,
    onToolCall,
    onFinish,
  }: ExtendedCallOptions<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  > & {
    chatId: string;
    message: CreateUIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >;
  }) {
    const state = this.getChatState(chatId);
    state.pushMessage({ ...message, id: message.id ?? this.generateId() });
    this.emit({
      type: 'chat-messages-changed',
      chatId,
    });
    await this.triggerRequest({
      chatId,
      headers,
      body,
      requestType: 'generate',
      onError,
      onToolCall,
      onFinish,
    });
  }

  async resubmitLastUserMessage({
    chatId,
    headers,
    body,
    onError,
    onToolCall,
    onFinish,
  }: ExtendedCallOptions<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  > & {
    chatId: string;
  }) {
    const chat = this.getChatState(chatId);

    if (chat.messages[chat.messages.length - 1].role === 'assistant') {
      chat.popMessage();
      this.emit({
        type: 'chat-messages-changed',
        chatId,
      });
    }

    if (chat.messages.length === 0) {
      return;
    }

    return this.triggerRequest({
      chatId,
      requestType: 'generate',
      headers,
      body,
      onError,
      onToolCall,
      onFinish,
    });
  }

  async resumeStream({
    chatId,
    headers,
    body,
    onError,
    onToolCall,
    onFinish,
  }: ExtendedCallOptions<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  > & {
    chatId: string;
  }) {
    return this.triggerRequest({
      chatId,
      requestType: 'resume',
      headers,
      body,
      onError,
      onToolCall,
      onFinish,
    });
  }

  async addToolResult({
    chatId,
    toolCallId,
    result,
  }: {
    chatId: string;
    toolCallId: string;
    result: unknown;
  }) {
    const chat = this.getChatState(chatId);

    chat.jobExecutor.run(async () => {
      updateToolCallResult({
        messages: chat.messages,
        toolCallId,
        toolResult: result,
      });

      this.setMessages({
        id: chatId,
        messages: chat.messages,
      });

      // when the request is ongoing, the auto-submit will be triggered after the request is finished
      if (chat.status === 'submitted' || chat.status === 'streaming') {
        return;
      }

      // auto-submit when all tool calls in the last assistant message have results:
      const lastMessage = chat.messages[chat.messages.length - 1];
      if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
        // we do not await this call to avoid a deadlock in the serial job executor; triggerRequest also uses the job executor internally.
        this.triggerRequest({
          requestType: 'generate',
          chatId,
        });
      }
    });
  }

  async stopStream({ chatId }: { chatId: string }) {
    const chat = this.getChatState(chatId);

    if (chat.status !== 'streaming' && chat.status !== 'submitted') return;

    if (chat.activeResponse?.abortController) {
      chat.activeResponse.abortController.abort();
      chat.activeResponse.abortController = undefined;
    }
  }

  private emit(event: ChatStoreEvent) {
    for (const subscriber of this.subscribers) {
      subscriber.onChatChanged(event);
    }
  }

  private getChatState(
    id: string,
  ): Chat<MESSAGE_METADATA, InferUIDataParts<UI_DATA_PART_SCHEMAS>> {
    if (!this.hasChat(id)) {
      this.addChat(id, []);
    }
    return this.chats.get(id)!;
  }

  private async triggerRequest({
    chatId,
    requestType,
    headers,
    body,
    onError,
    onToolCall,
    onFinish,
  }: ExtendedCallOptions<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  > & {
    chatId: string;
    requestType: 'generate' | 'resume';
  }) {
    const chat = this.getChatState(chatId);

    this.setStatus({ id: chatId, status: 'submitted', error: undefined });

    const messageCount = chat.messages.length;
    const maxStep = extractMaxToolInvocationStep(
      getToolInvocations(chat.messages[chat.messages.length - 1]),
    );

    try {
      const lastMessage = chat.messages[chat.messages.length - 1];
      const activeResponse = {
        state: createStreamingUIMessageState({
          lastMessage: chat.snapshot ? chat.snapshot(lastMessage) : lastMessage,
          newMessageId: this.generateId(),
        }),
        abortController: new AbortController(),
      };

      chat.setActiveResponse(activeResponse);

      const stream = await this.transport.submitMessages({
        chatId,
        messages: chat.messages,
        body,
        headers,
        abortController: activeResponse.abortController,
        requestType,
      });

      const runUpdateMessageJob = (
        job: (options: {
          state: StreamingUIMessageState<
            MESSAGE_METADATA,
            UI_DATA_PART_SCHEMAS
          >;
          write: () => void;
        }) => Promise<void>,
      ) =>
        // serialize the job execution to avoid race conditions:
        chat.jobExecutor.run(() =>
          job({
            state: activeResponse.state,
            write: () => {
              // streaming is set on first write (before it should be "submitted")
              this.setStatus({ id: chatId, status: 'streaming' });

              const replaceLastMessage =
                activeResponse.state.message.id ===
                chat.messages[chat.messages.length - 1].id;

              if (replaceLastMessage) {
                chat.replaceMessage(
                  chat.messages.length - 1,
                  activeResponse.state.message,
                );
              } else {
                chat.pushMessage(activeResponse.state.message);
              }

              this.emit({
                type: 'chat-messages-changed',
                chatId,
              });
            },
          }),
        );

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          onToolCall,
          messageMetadataSchema: this.messageMetadataSchema,
          dataPartSchemas: this.dataPartSchemas,
          runUpdateMessageJob,
        }),
        onError: error => {
          throw error;
        },
      });

      onFinish?.({ message: activeResponse.state.message });

      this.setStatus({ id: chatId, status: 'ready' });
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        this.setStatus({ id: chatId, status: 'ready' });
        return null;
      }

      if (onError && err instanceof Error) {
        onError(err);
      }

      this.setStatus({ id: chatId, status: 'error', error: err as Error });
    } finally {
      chat.setActiveResponse(undefined);
    }

    // auto-submit when all tool calls in the last assistant message have results
    // and assistant has not answered yet
    if (
      shouldResubmitMessages({
        originalMaxToolInvocationStep: maxStep,
        originalMessageCount: messageCount,
        maxSteps: this.maxSteps,
        messages: chat.messages,
      })
    ) {
      await this.triggerRequest({
        chatId,
        requestType,
        onError,
        onToolCall,
        onFinish,
        headers,
        body,
      });
    }
  }
}

/**
 * Updates the result of a specific tool invocation in the last message of the given messages array.
 *
 * @param {object} params - The parameters object.
 * @param {UIMessage[]} params.messages - An array of messages, from which the last one is updated.
 * @param {string} params.toolCallId - The unique identifier for the tool invocation to update.
 * @param {unknown} params.toolResult - The result object to attach to the tool invocation.
 * @returns {void} This function does not return anything.
 */
function updateToolCallResult({
  messages,
  toolCallId,
  toolResult: result,
}: {
  messages: UIMessage[];
  toolCallId: string;
  toolResult: unknown;
}) {
  const lastMessage = messages[messages.length - 1];

  const invocationPart = lastMessage.parts.find(
    (part): part is ToolInvocationUIPart =>
      part.type === 'tool-invocation' &&
      part.toolInvocation.toolCallId === toolCallId,
  );

  if (invocationPart == null) {
    return;
  }

  invocationPart.toolInvocation = {
    ...invocationPart.toolInvocation,
    state: 'result' as const,
    result,
  };
}
