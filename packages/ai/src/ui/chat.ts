import {
  generateId as generateIdFunc,
  IdGenerator,
  StandardSchemaV1,
  Validator,
} from '@ai-sdk/provider-utils';
import { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import { consumeStream } from '../util/consume-stream';
import { SerialJobExecutor } from '../util/serial-job-executor';
import { ChatTransport } from './chat-transport';
import { convertFileListToFileUIParts } from './convert-file-list-to-file-ui-parts';
import { DefaultChatTransport } from './default-chat-transport';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  StreamingUIMessageState,
} from './process-ui-message-stream';
import {
  InferUIMessageToolCall,
  isToolUIPart,
  type DataUIPart,
  type FileUIPart,
  type InferUIMessageData,
  type InferUIMessageMetadata,
  type InferUIMessageTools,
  type UIDataTypes,
  type UIMessage,
} from './ui-messages';

export type CreateUIMessage<UI_MESSAGE extends UIMessage> = Omit<
  UI_MESSAGE,
  'id' | 'role'
> & {
  id?: UI_MESSAGE['id'];
  role?: UI_MESSAGE['role'];
};

export type UIDataPartSchemas = Record<
  string,
  Validator<any> | StandardSchemaV1<any>
>;

export type UIDataTypesToSchemas<T extends UIDataTypes> = {
  [K in keyof T]: Validator<T[K]> | StandardSchemaV1<T[K]>;
};

export type InferUIDataParts<T extends UIDataPartSchemas> = {
  [K in keyof T]: T[K] extends Validator<infer U>
    ? U
    : T[K] extends StandardSchemaV1<infer U>
      ? U
      : unknown;
};

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

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';

type ActiveResponse<UI_MESSAGE extends UIMessage> = {
  state: StreamingUIMessageState<UI_MESSAGE>;
  abortController: AbortController;
};

export interface ChatState<UI_MESSAGE extends UIMessage> {
  status: ChatStatus;

  error: Error | undefined;

  messages: UI_MESSAGE[];
  pushMessage: (message: UI_MESSAGE) => void;
  popMessage: () => void;
  replaceMessage: (index: number, message: UI_MESSAGE) => void;

  snapshot: <T>(thing: T) => T;
}

export type ChatOnErrorCallback = (error: Error) => void;

export type ChatOnToolCallCallback<UI_MESSAGE extends UIMessage = UIMessage> =
  (options: {
    toolCall: InferUIMessageToolCall<UI_MESSAGE>;
  }) => void | PromiseLike<void>;

export type ChatOnDataCallback<UI_MESSAGE extends UIMessage> = (
  dataPart: DataUIPart<InferUIMessageData<UI_MESSAGE>>,
) => void;

export type ChatOnFinishCallback<UI_MESSAGE extends UIMessage> = (options: {
  message: UI_MESSAGE;
}) => void;

export interface ChatInit<UI_MESSAGE extends UIMessage> {
  /**
   * A unique identifier for the chat. If not provided, a random one will be
   * generated.
   */
  id?: string;

  messageMetadataSchema?:
    | Validator<InferUIMessageMetadata<UI_MESSAGE>>
    | StandardSchemaV1<InferUIMessageMetadata<UI_MESSAGE>>;
  dataPartSchemas?: UIDataTypesToSchemas<InferUIMessageData<UI_MESSAGE>>;

  messages?: UI_MESSAGE[];

  /**
   * A way to provide a function that is going to be used for ids for messages and the chat.
   * If not provided the default AI SDK `generateId` is used.
   */
  generateId?: IdGenerator;

  transport?: ChatTransport<UI_MESSAGE>;

  /**
   * Callback function to be called when an error is encountered.
   */
  onError?: ChatOnErrorCallback;

  /**
  Optional callback function that is invoked when a tool call is received.
  Intended for automatic client-side tool execution.

  You can optionally return a result for the tool call,
  either synchronously or asynchronously.
     */
  onToolCall?: ChatOnToolCallCallback<UI_MESSAGE>;

  /**
   * Optional callback function that is called when the assistant message is finished streaming.
   *
   * @param message The message that was streamed.
   */
  onFinish?: ChatOnFinishCallback<UI_MESSAGE>;

  /**
   * Optional callback function that is called when a data part is received.
   *
   * @param data The data part that was received.
   */
  onData?: ChatOnDataCallback<UI_MESSAGE>;
}

export abstract class AbstractChat<UI_MESSAGE extends UIMessage> {
  readonly id: string;
  readonly generateId: IdGenerator;

  protected state: ChatState<UI_MESSAGE>;

  private messageMetadataSchema:
    | Validator<InferUIMessageMetadata<UI_MESSAGE>>
    | StandardSchemaV1<InferUIMessageMetadata<UI_MESSAGE>>
    | undefined;
  private dataPartSchemas:
    | UIDataTypesToSchemas<InferUIMessageData<UI_MESSAGE>>
    | undefined;
  private readonly transport: ChatTransport<UI_MESSAGE>;
  private onError?: ChatInit<UI_MESSAGE>['onError'];
  private onToolCall?: ChatInit<UI_MESSAGE>['onToolCall'];
  private onFinish?: ChatInit<UI_MESSAGE>['onFinish'];
  private onData?: ChatInit<UI_MESSAGE>['onData'];

  private activeResponse: ActiveResponse<UI_MESSAGE> | undefined = undefined;
  private jobExecutor = new SerialJobExecutor();

  constructor({
    generateId = generateIdFunc,
    id = generateId(),
    transport = new DefaultChatTransport(),
    messageMetadataSchema,
    dataPartSchemas,
    state,
    onError,
    onToolCall,
    onFinish,
    onData,
  }: Omit<ChatInit<UI_MESSAGE>, 'messages'> & {
    state: ChatState<UI_MESSAGE>;
  }) {
    this.id = id;
    this.transport = transport;
    this.generateId = generateId;
    this.messageMetadataSchema = messageMetadataSchema;
    this.dataPartSchemas = dataPartSchemas;
    this.state = state;
    this.onError = onError;
    this.onToolCall = onToolCall;
    this.onFinish = onFinish;
    this.onData = onData;
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
  }

  get error() {
    return this.state.error;
  }

  get messages(): UI_MESSAGE[] {
    return this.state.messages;
  }

  get lastMessage(): UI_MESSAGE | undefined {
    return this.state.messages[this.state.messages.length - 1];
  }

  set messages(messages: UI_MESSAGE[]) {
    this.state.messages = messages;
  }

  /**
   * Appends or replaces a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   *
   * If a messageId is provided, the message will be replaced.
   */
  sendMessage = async (
    message?:
      | (CreateUIMessage<UI_MESSAGE> & {
          text?: never;
          files?: never;
          messageId?: string;
        })
      | {
          text: string;
          files?: FileList | FileUIPart[];
          metadata?: InferUIMessageMetadata<UI_MESSAGE>;
          parts?: never;
          messageId?: string;
        }
      | {
          files: FileList | FileUIPart[];
          metadata?: InferUIMessageMetadata<UI_MESSAGE>;
          parts?: never;
          messageId?: string;
        },
    options?: ChatRequestOptions,
  ): Promise<void> => {
    if (message == null) {
      await this.makeRequest({
        trigger: 'submit-message',
        messageId: this.lastMessage?.id,
        ...options,
      });
      return;
    }

    let uiMessage: CreateUIMessage<UI_MESSAGE>;

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
      } as UI_MESSAGE;
    } else {
      uiMessage = message;
    }

    if (message.messageId != null) {
      const messageIndex = this.state.messages.findIndex(
        m => m.id === message.messageId,
      );

      if (messageIndex === -1) {
        throw new Error(`message with id ${message.messageId} not found`);
      }

      if (this.state.messages[messageIndex].role !== 'user') {
        throw new Error(
          `message with id ${message.messageId} is not a user message`,
        );
      }

      // remove all messages after the message with the given id
      this.state.messages = this.state.messages.slice(0, messageIndex + 1);

      // update the message with the new content
      this.state.replaceMessage(messageIndex, {
        ...uiMessage,
        id: message.messageId,
        role: uiMessage.role ?? 'user',
        metadata: message.metadata,
      } as UI_MESSAGE);
    } else {
      this.state.pushMessage({
        ...uiMessage,
        id: uiMessage.id ?? this.generateId(),
        role: uiMessage.role ?? 'user',
        metadata: message.metadata,
      } as UI_MESSAGE);
    }

    await this.makeRequest({
      trigger: 'submit-message',
      messageId: message.messageId,
      ...options,
    });
  };

  /**
   * Regenerate the assistant message with the provided message id.
   * If no message id is provided, the last assistant message will be regenerated.
   */
  regenerate = async ({
    messageId,
    ...options
  }: {
    messageId?: string;
  } & ChatRequestOptions = {}): Promise<void> => {
    const messageIndex =
      messageId == null
        ? this.state.messages.length - 1
        : this.state.messages.findIndex(message => message.id === messageId);

    if (messageIndex === -1) {
      throw new Error(`message ${messageId} not found`);
    }

    // set the messages to the message before the assistant message
    this.state.messages = this.state.messages.slice(
      0,
      // if the message is a user message, we need to include it in the request:
      this.messages[messageIndex].role === 'assistant'
        ? messageIndex
        : messageIndex + 1,
    );

    await this.makeRequest({
      trigger: 'regenerate-message',
      messageId,
      ...options,
    });
  };

  /**
   * Attempt to resume an ongoing streaming response.
   */
  resumeStream = async (options: ChatRequestOptions = {}): Promise<void> => {
    await this.makeRequest({ trigger: 'resume-stream', ...options });
  };

  addToolResult = async <TOOL extends keyof InferUIMessageTools<UI_MESSAGE>>({
    tool,
    toolCallId,
    output,
  }: {
    tool: TOOL;
    toolCallId: string;
    output: InferUIMessageTools<UI_MESSAGE>[TOOL]['output'];
  }) => {
    this.jobExecutor.run(async () => {
      const messages = this.state.messages;
      const lastMessage = messages[messages.length - 1];

      this.state.replaceMessage(messages.length - 1, {
        ...lastMessage,
        parts: lastMessage.parts.map(part =>
          isToolUIPart(part) && part.toolCallId === toolCallId
            ? { ...part, state: 'output-available', output }
            : part,
        ),
      });

      // update the active response if it exists
      if (this.activeResponse) {
        this.activeResponse.state.message.parts =
          this.activeResponse.state.message.parts.map(part =>
            isToolUIPart(part) && part.toolCallId === toolCallId
              ? {
                  ...part,
                  state: 'output-available',
                  output,
                  errorText: undefined,
                }
              : part,
          );
      }
    });
  };

  /**
   * Checks if the assistant message can be submitted, i.e. if it
   * has tool calls and all tool calls have results.
   *
   * @returns {boolean} True if the assistant message can be submitted, false otherwise.
   */
  canAssistantMessageBeSubmitted = (): boolean =>
    isAssistantMessageWithCompletedToolCalls(this.lastMessage);

  /**
   * Abort the current request immediately, keep the generated tokens if any.
   */
  stop = async () => {
    if (this.status !== 'streaming' && this.status !== 'submitted') return;

    if (this.activeResponse?.abortController) {
      this.activeResponse.abortController.abort();
    }
  };

  private async makeRequest({
    trigger,
    metadata,
    headers,
    body,
    messageId,
  }: {
    trigger: 'submit-message' | 'resume-stream' | 'regenerate-message';
    messageId?: string;
  } & ChatRequestOptions) {
    this.setStatus({ status: 'submitted', error: undefined });

    const lastMessage = this.lastMessage;

    try {
      const activeResponse = {
        state: createStreamingUIMessageState({
          lastMessage: this.state.snapshot(lastMessage),
          messageId: this.generateId(),
        }),
        abortController: new AbortController(),
      } as ActiveResponse<UI_MESSAGE>;

      this.activeResponse = activeResponse;

      let stream: ReadableStream<UIMessageChunk>;

      if (trigger === 'resume-stream') {
        const reconnect = await this.transport.reconnectToStream({
          chatId: this.id,
          metadata,
          headers,
          body,
        });

        if (reconnect == null) {
          return; // no active stream found, so we do not resume
        }

        stream = reconnect;
      } else {
        stream = await this.transport.sendMessages({
          chatId: this.id,
          messages: this.state.messages,
          abortSignal: activeResponse.abortController.signal,
          metadata,
          headers,
          body,
          trigger,
          messageId,
        });
      }

      const runUpdateMessageJob = (
        job: (options: {
          state: StreamingUIMessageState<UI_MESSAGE>;
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
            },
          }),
        );

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          onToolCall: this.onToolCall,
          onData: this.onData,
          messageMetadataSchema: this.messageMetadataSchema,
          dataPartSchemas: this.dataPartSchemas,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
        onError: error => {
          throw error;
        },
      });

      this.onFinish?.({ message: activeResponse.state.message });

      this.setStatus({ status: 'ready' });
    } catch (err) {
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
  }
}

/**
Check if the message is an assistant message with completed tool calls.
The last step of the message must have at least one tool invocation and
all tool invocations must have a result.
 */
export function isAssistantMessageWithCompletedToolCalls(
  message: UIMessage | undefined,
): message is UIMessage & {
  role: 'assistant';
} {
  if (!message) {
    return false;
  }

  if (message.role !== 'assistant') {
    return false;
  }

  const lastStepStartIndex = message.parts.reduce((lastIndex, part, index) => {
    return part.type === 'step-start' ? index : lastIndex;
  }, -1);

  const lastStepToolInvocations = message.parts
    .slice(lastStepStartIndex + 1)
    .filter(isToolUIPart);

  return (
    lastStepToolInvocations.length > 0 &&
    lastStepToolInvocations.every(part => part.state === 'output-available')
  );
}
