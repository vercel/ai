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
import { convertFileListToFileUIParts } from './convert-file-list-to-file-ui-parts';
import { DefaultChatTransport } from './default-chat-transport';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  StreamingUIMessageState,
} from './process-ui-message-stream';
import {
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
} from './should-resubmit-messages';
import {
  isToolUIPart,
  type FileUIPart,
  type InferUIMessageData,
  type InferUIMessageMetadata,
  type InferUIMessageTools,
  type ToolUIPart,
  type UIDataTypes,
  type UIMessage,
} from './ui-messages';
import { UIMessageStreamPart } from '../ui-message-stream/ui-message-stream-parts';

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
  onFinish?: (options: { message: UI_MESSAGE }) => void;
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
  private maxSteps: number;
  private onError?: ChatInit<UI_MESSAGE>['onError'];
  private onToolCall?: ChatInit<UI_MESSAGE>['onToolCall'];
  private onFinish?: ChatInit<UI_MESSAGE>['onFinish'];

  private activeResponse: ActiveResponse<UI_MESSAGE> | undefined = undefined;
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
  }: Omit<ChatInit<UI_MESSAGE>, 'messages'> & {
    state: ChatState<UI_MESSAGE>;
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
    message:
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
    options: ChatRequestOptions = {},
  ): Promise<void> => {
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
      } as UI_MESSAGE);
    } else {
      this.state.pushMessage({
        ...uiMessage,
        id: uiMessage.id ?? this.generateId(),
        role: uiMessage.role ?? 'user',
      } as UI_MESSAGE);
    }

    await this.makeRequest({
      trigger: 'submit-user-message',
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
      trigger: 'regenerate-assistant-message',
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

  addToolResult = async ({
    toolCallId,
    output,
  }: {
    toolCallId: string;
    output: unknown;
  }) => {
    this.jobExecutor.run(async () => {
      updateToolOutput({
        messages: this.state.messages,
        toolCallId,
        output,
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
        this.makeRequest({
          trigger: 'submit-tool-result',
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
    }
  };

  private async makeRequest({
    trigger,
    metadata,
    headers,
    body,
    messageId,
  }: {
    trigger:
      | 'submit-user-message'
      | 'resume-stream'
      | 'submit-tool-result'
      | 'regenerate-assistant-message';
    messageId?: string;
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
          messageId: this.generateId(),
        }),
        abortController: new AbortController(),
      } as ActiveResponse<UI_MESSAGE>;

      this.activeResponse = activeResponse;

      let stream: ReadableStream<UIMessageStreamPart>;

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
      await this.makeRequest({
        metadata,
        headers,
        body,
        // secondary requests are triggered by automatic tool execution
        trigger: 'submit-tool-result',
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
function updateToolOutput<UI_MESSAGE extends UIMessage>({
  messages,
  toolCallId,
  output,
}: {
  messages: UI_MESSAGE[];
  toolCallId: string;
  output: unknown;
}) {
  const lastMessage = messages[messages.length - 1];

  const toolPart = lastMessage.parts.find(
    (part): part is ToolUIPart<InferUIMessageTools<UI_MESSAGE>> =>
      isToolUIPart(part) && part.toolCallId === toolCallId,
  );

  if (toolPart == null) {
    return;
  }

  toolPart.state = 'output-available';
  (
    toolPart as ToolUIPart<InferUIMessageTools<UI_MESSAGE>> & {
      state: 'output-available';
    }
  ).output = output;
}
