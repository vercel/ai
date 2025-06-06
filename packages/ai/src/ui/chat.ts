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
  UIDataPartSchemas,
  InferUIDataParts,
  FileUIPart,
} from './ui-messages';
import { DefaultChatTransport } from './default-chat-transport';
import { convertFileListToFileUIParts } from './convert-file-list-to-file-ui-parts';

export type ChatRequestOptions = {
  /**
  Additional headers that should be to be passed to the API endpoint.
   */
  headers?: Record<string, string> | Headers;

  /**
  Additional body JSON properties that should be sent to the API endpoint.
   */
  body?: object; // TODO JSONStringifyable

  metadata?: unknown;
};

export interface ChatSubscriber {
  onChange: (event: ChatEvent) => void;
}

export interface ChatEvent {
  type: 'messages-changed' | 'status-changed';
}

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';

type ActiveResponse<MESSAGE_METADATA> = {
  state: StreamingUIMessageState<MESSAGE_METADATA>;
  abortController: AbortController | undefined;
};

export interface ChatState<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes> {
  status: ChatStatus;

  error: Error | undefined;

  messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
  pushMessage: (message: UIMessage<MESSAGE_METADATA, DATA_TYPES>) => void;
  popMessage: () => void;
  replaceMessage: (
    index: number,
    message: UIMessage<MESSAGE_METADATA, DATA_TYPES>,
  ) => void;

  snapshot: <T>(thing: T) => T;
}

export interface ChatInit<
  MESSAGE_METADATA = unknown,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> {
  /**
   * A unique identifier for the chat. If not provided, a random one will be
   * generated.
   */
  id?: string;

  messageMetadataSchema?:
    | Validator<MESSAGE_METADATA>
    | StandardSchemaV1<MESSAGE_METADATA>;
  dataPartSchemas?: UI_DATA_PART_SCHEMAS;

  messages?: UIMessage<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  >[];

  /**
   * A way to provide a function that is going to be used for ids for messages and the chat.
   * If not provided the default AI SDK `generateId` is used.
   */
  generateId?: IdGenerator;

  transport?: ChatTransport<
    NoInfer<MESSAGE_METADATA>,
    NoInfer<InferUIDataParts<UI_DATA_PART_SCHEMAS>>
  >;

  maxSteps?: number;

  /**
   * Callback function to be called when an error is encountered.
   */
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
    message: UIMessage<
      NoInfer<MESSAGE_METADATA>,
      NoInfer<InferUIDataParts<UI_DATA_PART_SCHEMAS>>
    >;
  }) => void;
}

export abstract class AbstractChat<
  MESSAGE_METADATA = unknown,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> {
  readonly id: string;
  readonly generateId: IdGenerator;

  protected state: ChatState<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  >;

  private readonly subscribers: Set<ChatSubscriber> = new Set();

  private messageMetadataSchema:
    | Validator<MESSAGE_METADATA>
    | StandardSchemaV1<MESSAGE_METADATA>
    | undefined;
  private dataPartSchemas: UI_DATA_PART_SCHEMAS | undefined;
  private readonly transport: ChatTransport<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  >;
  private maxSteps: number;
  private onError?: ChatInit<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>['onError'];
  private onToolCall?: ChatInit<
    MESSAGE_METADATA,
    UI_DATA_PART_SCHEMAS
  >['onToolCall'];
  private onFinish?: ChatInit<
    MESSAGE_METADATA,
    UI_DATA_PART_SCHEMAS
  >['onFinish'];

  private activeResponse: ActiveResponse<MESSAGE_METADATA> | undefined =
    undefined;
  private jobExecutor = new SerialJobExecutor();

  constructor({
    generateId = generateIdFunc,
    id = generateId(),
    transport = new DefaultChatTransport(),
    maxSteps = 1,
    messageMetadataSchema,
    dataPartSchemas,
    state,
    onError,
    onToolCall,
    onFinish,
  }: Omit<ChatInit<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>, 'messages'> & {
    state: ChatState<MESSAGE_METADATA, InferUIDataParts<UI_DATA_PART_SCHEMAS>>;
  }) {
    this.id = id;
    this.maxSteps = maxSteps;
    this.transport = transport;
    this.generateId = generateId;
    this.messageMetadataSchema = messageMetadataSchema;
    this.dataPartSchemas = dataPartSchemas;
    this.state = state;
    this.onError = onError;
    this.onToolCall = onToolCall;
    this.onFinish = onFinish;
  }

  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  get status(): ChatStatus {
    return this.state.status;
  }

  protected setStatus({
    status,
    error,
  }: {
    status: ChatStatus;
    error?: Error;
  }) {
    if (this.status === status) return;

    this.state.status = status;
    this.state.error = error;

    this.emit({ type: 'status-changed' });
  }

  get error() {
    return this.state.error;
  }

  get messages(): UIMessage<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  >[] {
    return this.state.messages;
  }

  get lastMessage():
    | UIMessage<MESSAGE_METADATA, InferUIDataParts<UI_DATA_PART_SCHEMAS>>
    | undefined {
    return this.state.messages[this.state.messages.length - 1];
  }

  subscribe(subscriber: ChatSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  set messages(
    messages: UIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >[],
  ) {
    this.state.messages = messages;
    this.emit({ type: 'messages-changed' });
  }

  removeAssistantResponse = () => {
    const lastMessage = this.state.messages[this.state.messages.length - 1];

    if (lastMessage == null) {
      throw new Error('Cannot remove assistant response from empty chat');
    }

    if (lastMessage.role !== 'assistant') {
      throw new Error('Last message is not an assistant message');
    }

    this.state.popMessage();
    this.emit({ type: 'messages-changed' });
  };

  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   */
  sendMessage = async (
    message:
      | (CreateUIMessage<
          MESSAGE_METADATA,
          InferUIDataParts<UI_DATA_PART_SCHEMAS>
        > & { text?: never; files?: never })
      | {
          text: string;
          files?: FileList | FileUIPart[];
          metadata?: MESSAGE_METADATA;
          parts?: never;
        }
      | {
          files: FileList | FileUIPart[];
          metadata?: MESSAGE_METADATA;
          parts?: never;
        },
    options: ChatRequestOptions = {},
  ): Promise<void> => {
    let uiMessage: CreateUIMessage<
      MESSAGE_METADATA,
      InferUIDataParts<UI_DATA_PART_SCHEMAS>
    >;

    if ('text' in message || 'files' in message) {
      const fileParts = Array.isArray(message.files)
        ? message.files
        : await convertFileListToFileUIParts(message.files);

      uiMessage = {
        parts: [
          ...fileParts,
          ...('text' in message && message.text != null
            ? [{ type: 'text' as const, text: message.text }]
            : []),
        ],
      };
    } else {
      uiMessage = message;
    }

    this.state.pushMessage({
      ...uiMessage,
      id: uiMessage.id ?? this.generateId(),
      role: uiMessage.role ?? 'user',
    });

    this.emit({ type: 'messages-changed' });
    await this.triggerRequest({ requestType: 'generate', ...options });
  };

  /**
   * Regenerate the last assistant message.
   */
  reload = async (options: ChatRequestOptions = {}): Promise<void> => {
    // TODO stop any ongoing request
    if (this.lastMessage === undefined) {
      return;
    }

    if (this.lastMessage.role === 'assistant') {
      this.state.popMessage();
      this.emit({ type: 'messages-changed' });
    }

    await this.triggerRequest({ requestType: 'generate', ...options });
  };

  /**
   * Resume an ongoing chat generation stream. This does not resume an aborted generation.
   */
  experimental_resume = async (
    options: ChatRequestOptions = {},
  ): Promise<void> => {
    await this.triggerRequest({ requestType: 'resume', ...options });
  };

  addToolResult = async ({
    toolCallId,
    result,
  }: {
    toolCallId: string;
    result: unknown;
  }) => {
    this.jobExecutor.run(async () => {
      updateToolCallResult({
        messages: this.state.messages,
        toolCallId,
        toolResult: result,
      });

      this.messages = this.state.messages;

      // when the request is ongoing, the auto-submit will be triggered after the request is finished
      if (this.status === 'submitted' || this.status === 'streaming') {
        return;
      }

      // auto-submit when all tool calls in the last assistant message have results:
      const lastMessage = this.lastMessage;
      if (isAssistantMessageWithCompletedToolCalls(lastMessage)) {
        // we do not await this call to avoid a deadlock in the serial job executor; triggerRequest also uses the job executor internally.
        this.triggerRequest({
          requestType: 'generate',
        });
      }
    });
  };

  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop = async () => {
    if (this.status !== 'streaming' && this.status !== 'submitted') return;

    if (this.activeResponse?.abortController) {
      this.activeResponse.abortController.abort();
      this.activeResponse.abortController = undefined;
    }
  };

  private emit(event: ChatEvent) {
    for (const subscriber of this.subscribers) {
      subscriber.onChange(event);
    }
  }

  private async triggerRequest({
    requestType,
    metadata,
    headers,
    body,
  }: {
    requestType: 'generate' | 'resume';
  } & ChatRequestOptions) {
    this.setStatus({ status: 'submitted', error: undefined });

    const messageCount = this.state.messages.length;
    const lastMessage = this.lastMessage;
    const maxStep =
      lastMessage?.parts.filter(part => part.type === 'step-start').length ?? 0; // TODO: should this be 1?

    try {
      const activeResponse = {
        state: createStreamingUIMessageState({
          lastMessage: this.state.snapshot(lastMessage),
          newMessageId: this.generateId(),
        }),
        abortController: new AbortController(),
      };

      this.activeResponse = activeResponse;

      const stream = await this.transport.submitMessages({
        chatId: this.id,
        messages: this.state.messages,
        abortSignal: activeResponse.abortController.signal,
        metadata,
        headers,
        body,
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
        this.jobExecutor.run(() =>
          job({
            state: activeResponse.state,
            write: () => {
              // streaming is set on first write (before it should be "submitted")
              this.setStatus({ status: 'streaming' });

              const replaceLastMessage =
                activeResponse.state.message.id === this.lastMessage?.id;

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
          onToolCall: this.onToolCall,
          messageMetadataSchema: this.messageMetadataSchema,
          dataPartSchemas: this.dataPartSchemas,
          runUpdateMessageJob,
        }),
        onError: error => {
          throw error;
        },
      });

      this.onFinish?.({ message: activeResponse.state.message });

      this.setStatus({ status: 'ready' });
    } catch (err) {
      console.error(err);

      // Ignore abort errors as they are expected.
      if ((err as any).name === 'AbortError') {
        this.setStatus({ status: 'ready' });
        return null;
      }

      if (this.onError && err instanceof Error) {
        this.onError(err);
      }

      this.setStatus({ status: 'error', error: err as Error });
    } finally {
      this.activeResponse = undefined;
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
        metadata,
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
