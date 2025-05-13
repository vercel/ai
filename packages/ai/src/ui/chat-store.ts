import {
  IdGenerator,
  Schema,
  ToolCall,
  generateId as generateIdFunc,
} from '@ai-sdk/provider-utils';
import { consumeUIMessageStream } from './call-chat-api';
import { ChatTransport } from './chat-transport';
import { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
import { getToolInvocations } from './get-tool-invocations';
import {
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
} from './should-resubmit-messages';
import type { CreateUIMessage, UIMessage } from './ui-messages';
import { ChatRequestOptions, UseChatOptions } from './use-chat';
import { updateToolCallResult } from './update-tool-call-result';

export interface ChatStoreSubscriber {
  onChatChanged: (event: ChatStoreEvent) => void;
}

export interface ChatStoreEvent {
  type: 'chat-messages-changed' | 'chat-status-changed';
  chatId: number | string;
  error?: Error;
}

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';

export interface Chat<MESSAGE_METADATA> {
  status: ChatStatus;
  messages: UIMessage<MESSAGE_METADATA>[];
  error?: Error;
}

export class ChatStore<MESSAGE_METADATA> {
  private chats: Map<string, Chat<MESSAGE_METADATA>>;
  private subscribers: Set<ChatStoreSubscriber>;
  private generateId: IdGenerator;
  private messageMetadataSchema: Schema<MESSAGE_METADATA> | undefined;
  private transport: ChatTransport<MESSAGE_METADATA>;
  private maxSteps: number;

  constructor({
    chats = {},
    generateId,
    messageMetadataSchema,
    transport,
    maxSteps = 1,
  }: {
    chats?: {
      [id: string]: {
        messages: UIMessage<MESSAGE_METADATA>[];
      };
    };
    generateId?: UseChatOptions['generateId'];
    messageMetadataSchema?: Schema<MESSAGE_METADATA>;
    transport: ChatTransport<MESSAGE_METADATA>;
    maxSteps?: number;
  }) {
    this.chats = new Map(
      Object.entries(chats).map(([id, state]) => [
        id,
        {
          messages: [...state.messages],
          status: 'ready',
          activeResponse: undefined,
          error: undefined,
        },
      ]),
    );

    this.maxSteps = maxSteps;
    this.transport = transport;
    this.subscribers = new Set();
    this.generateId = generateId ?? generateIdFunc;
    this.messageMetadataSchema = messageMetadataSchema;
  }

  hasChat(id: string) {
    return this.chats.has(id);
  }

  addChat(id: string, messages: UIMessage<MESSAGE_METADATA>[]) {
    this.chats.set(id, {
      messages,
      status: 'ready',
    });
  }

  getChats() {
    return Array.from(this.chats.entries());
  }

  get chatCount() {
    return this.chats.size;
  }

  getStatus(id: string): ChatStatus {
    return this.getChat(id).status;
  }

  setStatus({
    id,
    status,
    error,
  }: {
    id: string;
    status: Chat<MESSAGE_METADATA>['status'];
    error?: Error;
  }) {
    const chat = this.getChat(id);

    if (chat.status === status) return;

    chat.status = status;
    chat.error = error;

    this.emitEvent({ type: 'chat-status-changed', chatId: id, error });
  }

  getError(id: string) {
    return this.getChat(id).error;
  }

  getMessages(id: string) {
    return this.getChat(id).messages;
  }

  getLastMessage(id: string) {
    const chat = this.getChat(id);
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
    messages: UIMessage<MESSAGE_METADATA>[];
  }) {
    const chat = this.getChat(id);

    chat.messages = [...messages];
    this.emitEvent({ type: 'chat-messages-changed', chatId: id });
  }

  appendMessage({
    id,
    message,
  }: {
    id: string;
    message: UIMessage<MESSAGE_METADATA>;
  }) {
    const chat = this.getChat(id);

    chat.messages = [...chat.messages, { ...message }];
    this.emitEvent({ type: 'chat-messages-changed', chatId: id });
  }

  removeAssistantResponse(id: string) {
    const chat = this.getChat(id);

    const lastMessage = chat.messages[chat.messages.length - 1];

    if (lastMessage == null) {
      throw new Error('Cannot remove assistant response from empty chat');
    }

    if (lastMessage.role !== 'assistant') {
      throw new Error('Last message is not an assistant message');
    }

    this.setMessages({ id, messages: chat.messages.slice(0, -1) });
  }

  // TODO this should not be exposed
  async triggerRequest({
    chatId,
    requestType,
    onError,
    onToolCall,
    onFinish,
    ...chatRequest
  }: ChatRequestOptions & {
    chatId: string;
    messages: UIMessage<MESSAGE_METADATA>[];
    requestType: 'generate' | 'resume';
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
      message: UIMessage<NoInfer<MESSAGE_METADATA>>;
    }) => void;
  }) {
    const self = this;
    this.setStatus({ id: chatId, status: 'submitted', error: undefined });

    const chatMessages = chatRequest.messages;

    const messageCount = chatMessages.length;
    const maxStep = extractMaxToolInvocationStep(
      getToolInvocations(chatMessages[chatMessages.length - 1]),
    );

    try {
      const abortController = new AbortController();

      // TODO expose abort controller
      // abortControllerRef.current = abortController;

      // const throttledMutate = throttle(mutate, throttleWaitMs);

      // // Do an optimistic update to show the updated messages immediately:
      // throttledMutate(chatMessages, false);

      const stream = await self.transport.submitMessages({
        chatId,
        messages: chatMessages,
        customRequestBody: chatRequest.body,
        customHeaders: chatRequest.headers,
        abortController,
        requestType,
      });

      await consumeUIMessageStream({
        stream,
        onUpdate({ message }) {
          self.setStatus({ id: chatId, status: 'streaming' });

          const replaceLastMessage =
            message.id === chatMessages[chatMessages.length - 1].id;

          const newMessages = [
            ...(replaceLastMessage
              ? chatMessages.slice(0, chatMessages.length - 1)
              : chatMessages),
            message,
          ];

          self.setMessages({
            id: chatId,
            messages: newMessages,
          });
        },
        onToolCall,
        onFinish,
        generateId: self.generateId,
        lastMessage: chatMessages[chatMessages.length - 1],
        messageMetadataSchema: self.messageMetadataSchema,
      });

      // TODO clear
      // abortControllerRef.current = null;

      this.setStatus({ id: chatId, status: 'ready' });
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        // abortControllerRef.current = null;
        this.setStatus({ id: chatId, status: 'ready' });
        return null;
      }

      if (onError && err instanceof Error) {
        onError(err);
      }

      this.setStatus({ id: chatId, status: 'error', error: err as Error });
    }

    // auto-submit when all tool calls in the last assistant message have results
    // and assistant has not answered yet
    const messagesX = self.getMessages(chatId);
    if (
      shouldResubmitMessages({
        originalMaxToolInvocationStep: maxStep,
        originalMessageCount: messageCount,
        maxSteps: self.maxSteps,
        messages: messagesX,
      })
    ) {
      await self.triggerRequest({
        chatId,
        requestType,
        onError,
        onToolCall,
        onFinish,
        ...chatRequest,
        messages: messagesX,
      });
    }
  }

  async submitMessage({
    chatId,
    message,
    customHeaders,
    customBody,
    onError,
    onToolCall,
    onFinish,
  }: {
    chatId: string;
    message: CreateUIMessage<MESSAGE_METADATA>;
    customHeaders: ChatRequestOptions['headers'];
    customBody: ChatRequestOptions['body'];
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
      message: UIMessage<NoInfer<MESSAGE_METADATA>>;
    }) => void;
  }) {
    const chat = this.getChat(chatId);
    const currentMessages = chat.messages;

    await this.triggerRequest({
      chatId,
      messages: currentMessages.concat({
        ...message,
        id: message.id ?? this.generateId(),
      }),
      headers: customHeaders,
      body: customBody,
      requestType: 'generate',
      onError,
      onToolCall,
      onFinish,
    });
  }

  addToolResult({
    chatId,
    toolCallId,
    result,
  }: {
    chatId: string;
    toolCallId: string;
    result: unknown;
  }) {
    const chat = this.getChat(chatId);
    const currentMessages = chat.messages;

    updateToolCallResult({
      messages: currentMessages,
      toolCallId,
      toolResult: result,
    });

    // array mutation is required to trigger a re-render
    this.setMessages({
      id: chatId,
      messages: [
        ...currentMessages.slice(0, currentMessages.length - 1),
        {
          ...currentMessages[currentMessages.length - 1],
          // @ts-ignore
          // update the revisionId to trigger a re-render
          revisionId: this.generateId(),
        },
      ],
    });

    // when the request is ongoing, the auto-submit will be triggered after the request is finished
    if (chat.status === 'submitted' || chat.status === 'streaming') {
      return;
    }

    // auto-submit when all tool calls in the last assistant message have results:
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
      this.triggerRequest({
        messages: currentMessages,
        requestType: 'generate',
        chatId,
      });
    }
  }

  private emitEvent(event: ChatStoreEvent) {
    for (const subscriber of this.subscribers) {
      subscriber.onChatChanged(event);
    }
  }

  private getChat(id: string): Chat<MESSAGE_METADATA> {
    if (!this.hasChat(id)) {
      throw new Error(`chat '${id}' not found`); // TODO AI SDK error
    }
    return this.chats.get(id)!;
  }
}
