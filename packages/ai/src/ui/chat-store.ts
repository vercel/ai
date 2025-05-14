import {
  IdGenerator,
  Schema,
  ToolCall,
  generateId as generateIdFunc,
} from '@ai-sdk/provider-utils';
import { SerialJobExecutor } from '../util/serial-job-executor';
import { consumeUIMessageStream } from './call-chat-api';
import { ChatTransport } from './chat-transport';
import { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
import { getToolInvocations } from './get-tool-invocations';
import {
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
} from './should-resubmit-messages';
import type {
  CreateUIMessage,
  ReasoningUIPart,
  TextUIPart,
  UIMessage,
} from './ui-messages';
import { updateToolCallResult } from './update-tool-call-result';
import { ChatRequestOptions, UseChatOptions } from './use-chat';

import { Job } from '../util/job';
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

  // Active response:
  activeResponse?: {
    message: UIMessage<MESSAGE_METADATA>;
    currentTextPart?: TextUIPart;
    setCurrentTextPart: (currentTextPart?: TextUIPart) => void;
    currentReasoningPart?: ReasoningUIPart;
    setCurrentReasoningPart: (currentReasoningPart?: ReasoningUIPart) => void;
    toolCalls?: Record<string, { textArgs: string; toolName: string }>;
  };
  abortController?: AbortController;
  jobExecutor?: SerialJobExecutor;
}

// TODO rename to something better
type ExtendedCallOptions<MESSAGE_METADATA> = ChatRequestOptions & {
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
};

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
          abortController: undefined,
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

    this.emit({ type: 'chat-status-changed', chatId: id, error });
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
    // mutate the messages array directly:
    this.getChat(id).messages = [...messages];
    this.emit({ type: 'chat-messages-changed', chatId: id });
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
    this.emit({ type: 'chat-messages-changed', chatId: id });
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

  async submitMessage({
    chatId,
    message,
    headers,
    body,
    onError,
    onToolCall,
    onFinish,
  }: ExtendedCallOptions<MESSAGE_METADATA> & {
    chatId: string;
    message: CreateUIMessage<MESSAGE_METADATA>;
  }) {
    const chat = this.getChat(chatId);
    const currentMessages = chat.messages;

    await this.triggerRequest({
      chatId,
      messages: currentMessages.concat({
        ...message,
        id: message.id ?? this.generateId(),
      }),
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
  }: ExtendedCallOptions<MESSAGE_METADATA> & {
    chatId: string;
  }) {
    const messages = this.getChat(chatId).messages;

    const messagesToSubmit =
      messages[messages.length - 1].role === 'assistant'
        ? messages.slice(0, -1)
        : messages;

    if (messagesToSubmit.length === 0) {
      return;
    }

    return this.triggerRequest({
      chatId,
      requestType: 'generate',
      messages: messagesToSubmit,
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
  }: ExtendedCallOptions<MESSAGE_METADATA> & {
    chatId: string;
  }) {
    const chat = this.getChat(chatId);
    const currentMessages = chat.messages;

    return this.triggerRequest({
      chatId,
      messages: currentMessages,
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
    const chat = this.getChat(chatId);
    const currentMessages = chat.messages;

    updateToolCallResult({
      messages: currentMessages,
      toolCallId,
      toolResult: result,
    });

    // updated the messages array:
    // TODO we need better immutability
    this.setMessages({ id: chatId, messages: currentMessages });

    // when the request is ongoing, the auto-submit will be triggered after the request is finished
    if (chat.status === 'submitted' || chat.status === 'streaming') {
      return;
    }

    // auto-submit when all tool calls in the last assistant message have results:
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
      await this.triggerRequest({
        messages: currentMessages,
        requestType: 'generate',
        chatId,
      });
    }
  }

  async stopStream({ chatId }: { chatId: string }) {
    const chat = this.getChat(chatId);
    if (chat.status !== 'streaming' && chat.status !== 'submitted') return;

    if (chat.abortController) {
      chat.abortController.abort();
      chat.abortController = undefined;
    }
  }

  private emit(event: ChatStoreEvent) {
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

  private async triggerRequest({
    chatId,
    messages: chatMessages,
    requestType,
    headers,
    body,
    onError,
    onToolCall,
    onFinish,
  }: ExtendedCallOptions<MESSAGE_METADATA> & {
    chatId: string;
    messages: UIMessage<MESSAGE_METADATA>[];
    requestType: 'generate' | 'resume';
  }) {
    const self = this;
    this.setStatus({ id: chatId, status: 'submitted', error: undefined });

    const messageCount = chatMessages.length;
    const maxStep = extractMaxToolInvocationStep(
      getToolInvocations(chatMessages[chatMessages.length - 1]),
    );

    try {
      const abortController = new AbortController();
      this.getChat(chatId).abortController = abortController;

      // const throttledMutate = throttle(mutate, throttleWaitMs);

      // // Do an optimistic update to show the updated messages immediately:
      // throttledMutate(chatMessages, false);

      const stream = await self.transport.submitMessages({
        chatId,
        messages: chatMessages,
        body,
        headers,
        abortController,
        requestType,
      });

      await consumeUIMessageStream({
        stream,
        onUpdate({ message }) {
          // self.setStatus({ id: chatId, status: 'streaming' });
          // const replaceLastMessage =
          //   message.id === chatMessages[chatMessages.length - 1].id;
          // const newMessages = [
          //   ...(replaceLastMessage
          //     ? chatMessages.slice(0, chatMessages.length - 1)
          //     : chatMessages),
          //   message,
          // ];
          // self.setMessages({
          //   id: chatId,
          //   messages: newMessages,
          // });
        },
        onToolCall,
        onFinish,
        onStart: () => self.setStatus({ id: chatId, status: 'streaming' }),
        generateId: self.generateId,
        lastMessage: chatMessages[chatMessages.length - 1],
        messageMetadataSchema: self.messageMetadataSchema,
        acquireLock: () => self.acquireLock(chatId),
      });

      this.getChat(chatId).abortController = undefined;
      this.setStatus({ id: chatId, status: 'ready' });
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        this.getChat(chatId).abortController = undefined;
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
    const currentMessages = self.getMessages(chatId);
    if (
      shouldResubmitMessages({
        originalMaxToolInvocationStep: maxStep,
        originalMessageCount: messageCount,
        maxSteps: self.maxSteps,
        messages: currentMessages,
      })
    ) {
      await self.triggerRequest({
        chatId,
        requestType,
        onError,
        onToolCall,
        onFinish,
        headers,
        body,
        messages: currentMessages,
      });
    }
  }

  acquireLock(chatId: string) {
    const self = this;
    const chat = this.getChat(chatId);

    if (chat.status === 'streaming' || chat.status === 'submitted') {
      throw new Error(
        'Cannot acquire lock for chat in streaming or submitted state',
      );
    }

    if (chat.jobExecutor == null) {
      chat.jobExecutor = new SerialJobExecutor();
    }

    return {
      write: (job: Job) => chat.jobExecutor!.run(job),
      release: () => self.emit({ type: 'chat-messages-changed', chatId }),
      activeResponse: self.initializeOrGetActiveResponse(chatId),
    };
  }

  private initializeOrGetActiveResponse(chatId: string) {
    const self = this;
    const chat = this.getChat(chatId);

    if (!chat) {
      throw new Error('Chat not found');
    }

    // return existing active response if it exists:
    if (chat.activeResponse) {
      return chat.activeResponse;
    }

    const lastMessage = this.getLastMessage(chatId);
    const lastAssistantMessage =
      lastMessage?.role === 'assistant' ? lastMessage : undefined;

    if (!lastAssistantMessage && lastMessage?.role !== 'user') {
      throw new Error('Corresponding user message not found');
    }

    const id = lastAssistantMessage?.id ?? this.generateId();
    const parts = lastAssistantMessage?.parts ?? [];

    // construct active response from last assistant message if exists or initialize base active response:
    chat.activeResponse = {
      message: {
        id,
        role: 'assistant',
        parts,
        metadata: lastAssistantMessage?.metadata ?? ({} as MESSAGE_METADATA),
      },
      currentTextPart: parts.find(part => part.type === 'text'),
      setCurrentTextPart: (currentTextPart?: TextUIPart) =>
        self.setCurrentTextPart(chatId, currentTextPart),
      currentReasoningPart: parts.find(part => part.type === 'reasoning'),
      setCurrentReasoningPart: (currentReasoningPart?: ReasoningUIPart) =>
        self.setCurrentReasoningPart(chatId, currentReasoningPart),
      toolCalls: parts
        .filter(part => part.type === 'tool-invocation')
        .reduce(
          (acc, part) => {
            acc[part.toolInvocation.toolCallId] = {
              textArgs: String(part.toolInvocation.args),
              toolName: part.toolInvocation.toolName,
            };
            return acc;
          },
          {} as Record<string, { textArgs: string; toolName: string }>,
        ),
    };

    chat.messages = [...chat.messages, chat.activeResponse.message];
    return chat.activeResponse;
  }

  private setCurrentTextPart(chatId: string, currentTextPart?: TextUIPart) {
    const chat = this.getChat(chatId);
    if (!chat.activeResponse) {
      throw new Error('Active response not found');
    }
    chat.activeResponse.currentTextPart = currentTextPart;
  }

  private setCurrentReasoningPart(
    chatId: string,
    currentReasoningPart?: ReasoningUIPart,
  ) {
    const chat = this.getChat(chatId);
    if (!chat.activeResponse) {
      throw new Error('Active response not found');
    }
    chat.activeResponse.currentReasoningPart = currentReasoningPart;
  }
}
