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

export interface ChatSubscriber {
  onChange: (event: ChatEvent) => void;
}

export interface ChatEvent {
  type: 'messages-changed' | 'status-changed';
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

export interface ChatState<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes> {
  readonly messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
  readonly error: Error | undefined;
  readonly activeResponse: ActiveResponse<MESSAGE_METADATA> | undefined;
  readonly jobExecutor: SerialJobExecutor;

  getStatus: () => ChatStatus;
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

export abstract class AbstractChat<
  MESSAGE_METADATA = unknown,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> {
  readonly id: string;

  private subscribers: Set<ChatSubscriber>;
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
  protected state: ChatState<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  >;

  constructor({
    id,
    generateId,
    transport,
    maxSteps = 1,
    messageMetadataSchema,
    dataPartSchemas,
    state,
  }: {
    id: string;
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
    state: ChatState<MESSAGE_METADATA, InferUIDataParts<UI_DATA_PART_SCHEMAS>>;
  }) {
    this.id = id;
    this.maxSteps = maxSteps;
    this.transport = transport;
    this.subscribers = new Set();
    this.generateId = generateId ?? generateIdFunc;
    this.messageMetadataSchema = messageMetadataSchema;
    this.dataPartSchemas = dataPartSchemas;
    this.state = state;
  }

  getStatus(): ChatStatus {
    return this.state.getStatus();
  }

  setStatus({ status, error }: { status: ChatStatus; error?: Error }) {
    if (this.getStatus() === status) return;

    this.state.setStatus(status);
    this.state.setError(error);

    this.emit({ type: 'status-changed' });
  }

  getError() {
    return this.state.error;
  }

  getMessages() {
    return this.state.messages;
  }

  getLastMessage() {
    return this.state.messages[this.state.messages.length - 1];
  }

  subscribe(subscriber: ChatSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  async setMessages({
    messages,
  }: {
    messages: UIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >[];
  }): Promise<void> {
    this.state.setMessages(messages);
    this.emit({ type: 'messages-changed' });
  }

  removeAssistantResponse() {
    const lastMessage = this.state.messages[this.state.messages.length - 1];

    if (lastMessage == null) {
      throw new Error('Cannot remove assistant response from empty chat');
    }

    if (lastMessage.role !== 'assistant') {
      throw new Error('Last message is not an assistant message');
    }

    this.state.popMessage();
    this.emit({ type: 'messages-changed' });
  }

  async submitMessage({
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
    message: CreateUIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >;
  }) {
    this.state.pushMessage({ ...message, id: message.id ?? this.generateId() });
    this.emit({ type: 'messages-changed' });
    await this.triggerRequest({
      headers,
      body,
      requestType: 'generate',
      onError,
      onToolCall,
      onFinish,
    });
  }

  async resubmitLastUserMessage({
    headers,
    body,
    onError,
    onToolCall,
    onFinish,
  }: ExtendedCallOptions<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  > & {}): Promise<void> {
    if (
      this.state.messages[this.state.messages.length - 1].role === 'assistant'
    ) {
      this.state.popMessage();
      this.emit({ type: 'messages-changed' });
    }

    if (this.state.messages.length === 0) {
      return;
    }

    await this.triggerRequest({
      requestType: 'generate',
      headers,
      body,
      onError,
      onToolCall,
      onFinish,
    });
  }

  async resumeStream({
    headers,
    body,
    onError,
    onToolCall,
    onFinish,
  }: ExtendedCallOptions<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  >): Promise<void> {
    await this.triggerRequest({
      requestType: 'resume',
      headers,
      body,
      onError,
      onToolCall,
      onFinish,
    });
  }

  async addToolResult({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: unknown;
  }) {
    this.state.jobExecutor.run(async () => {
      updateToolCallResult({
        messages: this.state.messages,
        toolCallId,
        toolResult: result,
      });

      this.setMessages({
        messages: this.state.messages,
      });

      // when the request is ongoing, the auto-submit will be triggered after the request is finished
      if (
        this.getStatus() === 'submitted' ||
        this.getStatus() === 'streaming'
      ) {
        return;
      }

      // auto-submit when all tool calls in the last assistant message have results:
      const lastMessage = this.state.messages[this.state.messages.length - 1];
      if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
        // we do not await this call to avoid a deadlock in the serial job executor; triggerRequest also uses the job executor internally.
        this.triggerRequest({
          requestType: 'generate',
        });
      }
    });
  }

  async stopStream() {
    if (this.getStatus() !== 'streaming' && this.getStatus() !== 'submitted')
      return;

    if (this.state.activeResponse?.abortController) {
      this.state.activeResponse.abortController.abort();
      this.state.activeResponse.abortController = undefined;
    }
  }

  private emit(event: ChatEvent) {
    for (const subscriber of this.subscribers) {
      subscriber.onChange(event);
    }
  }

  private async triggerRequest({
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
    requestType: 'generate' | 'resume';
  }) {
    this.setStatus({ status: 'submitted', error: undefined });

    const messageCount = this.state.messages.length;
    const lastMessage = this.state.messages[this.state.messages.length - 1];
    const maxStep = lastMessage.parts.filter(
      part => part.type === 'step-start',
    ).length;

    try {
      const activeResponse = {
        state: createStreamingUIMessageState({
          lastMessage: this.state.snapshot
            ? this.state.snapshot(lastMessage)
            : lastMessage,
          newMessageId: this.generateId(),
        }),
        abortController: new AbortController(),
      };

      this.state.setActiveResponse(activeResponse);

      const stream = await this.transport.submitMessages({
        chatId: this.id,
        messages: this.state.messages,
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
        this.state.jobExecutor.run(() =>
          job({
            state: activeResponse.state,
            write: () => {
              // streaming is set on first write (before it should be "submitted")
              this.setStatus({ status: 'streaming' });

              const replaceLastMessage =
                activeResponse.state.message.id ===
                this.state.messages[this.state.messages.length - 1].id;

              if (replaceLastMessage) {
                this.state.replaceMessage(
                  this.state.messages.length - 1,
                  activeResponse.state.message,
                );
              } else {
                this.state.pushMessage(activeResponse.state.message);
              }

              this.emit({
                type: 'messages-changed',
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

      this.setStatus({ status: 'ready' });
    } catch (err) {
      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        this.setStatus({ status: 'ready' });
        return null;
      }

      if (onError && err instanceof Error) {
        onError(err);
      }

      this.setStatus({ status: 'error', error: err as Error });
    } finally {
      this.state.setActiveResponse(undefined);
    }

    // auto-submit when all tool calls in the last assistant message have results
    // and assistant has not answered yet
    if (
      shouldResubmitMessages({
        originalMaxToolInvocationStep: maxStep,
        originalMessageCount: messageCount,
        maxSteps: this.maxSteps,
        messages: this.state.messages,
      })
    ) {
      await this.triggerRequest({
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
