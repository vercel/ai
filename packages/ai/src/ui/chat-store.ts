import {
  IdGenerator,
  Schema,
  ToolCall,
  generateId as generateIdFunc,
} from '@ai-sdk/provider-utils';
import { consumeUIMessageStream } from './call-chat-api';
import { ChatStoreBackend } from './chat-store-backend';
import { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
import { getToolInvocations } from './get-tool-invocations';
import { shouldResubmitMessages } from './should-resubmit-messages';
import type { UIMessage } from './ui-messages';
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
  private backend: ChatStoreBackend<MESSAGE_METADATA>;

  constructor({
    chats = {},
    generateId,
    messageMetadataSchema,
    backend,
  }: {
    chats?: {
      [id: string]: {
        messages: UIMessage<MESSAGE_METADATA>[];
      };
    };
    generateId?: UseChatOptions['generateId'];
    messageMetadataSchema?: Schema<MESSAGE_METADATA>;
    backend: ChatStoreBackend<MESSAGE_METADATA>;
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

    this.backend = backend;
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

  async triggerRequest({
    chatId,
    requestType,
    experimental_prepareRequestBody,
    credentials,
    maxSteps,
    onError,
    onToolCall,
    onFinish,
    ...chatRequest
  }: ChatRequestOptions & {
    chatId: string;
    messages: UIMessage<MESSAGE_METADATA>[];
    requestType: 'generate' | 'resume';
    credentials: RequestCredentials | undefined;
    maxSteps: number;
    onError?: (error: Error) => void;

    /**
     * Experimental (React only). When a function is provided, it will be used
     * to prepare the request body for the chat API. This can be useful for
     * customizing the request body based on the messages and data in the chat.
     *
     * @param id The id of the chat.
     * @param messages The current messages in the chat.
     * @param requestBody The request body object passed in the chat request.
     */
    experimental_prepareRequestBody?: (options: {
      id: string;
      messages: UIMessage<MESSAGE_METADATA>[];
      requestBody?: object;
    }) => unknown;

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

      const stream = await self.backend.submitMessages({
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
        maxSteps,
        messages: messagesX,
      })
    ) {
      await self.triggerRequest({
        chatId,
        requestType,
        experimental_prepareRequestBody,
        credentials,
        maxSteps,
        onError,
        onToolCall,
        onFinish,
        ...chatRequest,
        messages: messagesX,
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
