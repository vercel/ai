import {
  generateId as generateIdFunc,
  type FlexibleSchema,
  type IdGenerator,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import type { FinishReason } from '../types/language-model';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import { consumeStream } from '../util/consume-stream';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import { SerialJobExecutor } from '../util/serial-job-executor';
import type { ChatTransport } from './chat-transport';
import { convertFileListToFileUIParts } from './convert-file-list-to-file-ui-parts';
import { DefaultChatTransport } from './default-chat-transport';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  type StreamingUIMessageState,
  type UIMessageStreamWriteOptions,
} from './process-ui-message-stream';
import {
  isToolUIPart,
  type DataUIPart,
  type FileUIPart,
  type InferUIMessageData,
  type InferUIMessageMetadata,
  type InferUIMessageTools,
  type UIDataTypes,
  type UIMessage,
  type InferUIMessageToolCall,
  type UIMessagePart,
  type UITools,
} from './ui-messages';
export type CreateUIMessage<UI_MESSAGE extends UIMessage> = Omit<
  UI_MESSAGE,
  'id' | 'role'
> & {
  id?: UI_MESSAGE['id'];
  role?: UI_MESSAGE['role'];
};

export type UIDataPartSchemas = Record<string, FlexibleSchema>;

export type UIDataTypesToSchemas<T extends UIDataTypes> = {
  [K in keyof T]: FlexibleSchema<T[K]>;
};

export type InferUIDataParts<T extends UIDataPartSchemas> = {
  [K in keyof T]: InferSchema<T[K]>;
};

export type ChatRequestOptions = {
  /**
   * Additional headers that should be to be passed to the API endpoint.
   */
  headers?: Record<string, string> | Headers;

  /**
   * Additional body JSON properties that should be sent to the API endpoint.
   */
  body?: object; // TODO JSONStringifyable

  metadata?: unknown;
};

/**
 * Function that can be called to add a tool approval response to the chat.
 */
export type ChatAddToolApproveResponseFunction = ({
  id,
  approved,
  reason,
  options,
}: {
  id: string;

  /**
   * Flag indicating whether the approval was granted or denied.
   */
  approved: boolean;

  /**
   * Optional reason for the approval or denial.
   */
  reason?: string;

  /**
   * Optional request options to be used if `sendAutomaticallyWhen` callback returns true.
   */
  options?: ChatRequestOptions;
}) => void | PromiseLike<void>;

/**
 * Function that can be called to add a tool output to the chat.
 */
export type ChatAddToolOutputFunction<UI_MESSAGE extends UIMessage> = <
  TOOL extends keyof InferUIMessageTools<UI_MESSAGE>,
>({
  state,
  tool,
  toolCallId,
  output,
  errorText,
  options,
}: {
  /**
   * Name of the tool that was called.
   */
  tool: TOOL;

  /**
   * Identifier of the tool call to add output for.
   */
  toolCallId: string;

  /**
   * Optional request options to be used if `sendAutomaticallyWhen` callback returns true.
   */
  options?: ChatRequestOptions;
} & (
  | {
      state?: 'output-available';
      output: InferUIMessageTools<UI_MESSAGE>[TOOL]['output'];
      errorText?: never;
    }
  | {
      state: 'output-error';
      output?: never;
      errorText: string;
    }
)) => void | PromiseLike<void>;

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';

type ActiveResponse<UI_MESSAGE extends UIMessage> = {
  state: StreamingUIMessageState<UI_MESSAGE>;
  abortController: AbortController;
  completionPromise: Promise<void>;
};

type ActiveResumeRequest = {
  abortController: AbortController;
  completionPromise: Promise<void>;
};

type MakeRequestOptions = {
  trigger: 'submit-message' | 'resume-stream' | 'regenerate-message';
  messageId?: string;
} & ChatRequestOptions;

export interface ChatState<UI_MESSAGE extends UIMessage> {
  status: ChatStatus;

  error: Error | undefined;

  messages: UI_MESSAGE[];
  pushMessage: (message: UI_MESSAGE) => void;
  popMessage: () => void;
  replaceMessage: (index: number, message: UI_MESSAGE) => void;

  /**
   * Experimental. Messages that are waiting to be sent when
   * `experimental_queue` is enabled. States that don't implement it keep the
   * queue in the chat, without change notifications.
   */
  experimental_queuedMessages?: UI_MESSAGE[];

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

/**
 * Function that is called when the assistant response has finished streaming.
 *
 * @param message The assistant message that was streamed.
 * @param messages The full chat history, including the assistant message.
 *
 * @param isAbort Indicates whether the request has been aborted.
 * @param isDisconnect Indicates whether the request has been ended by a network error.
 * @param isError Indicates whether the request has been ended by an error.
 * @param finishReason The reason why the generation finished.
 */
export type ChatOnFinishCallback<UI_MESSAGE extends UIMessage> = (options: {
  message: UI_MESSAGE;
  messages: UI_MESSAGE[];
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
  finishReason?: FinishReason;
}) => void;

export interface ChatInit<UI_MESSAGE extends UIMessage> {
  /**
   * A unique identifier for the chat. If not provided, a random one will be
   * generated when first accessed.
   */
  id?: string;

  messageMetadataSchema?: FlexibleSchema<UI_MESSAGE['metadata']>;
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
   * Optional callback function that is invoked when a tool call is received.
   * Intended for automatic client-side tool execution.
   *
   * To add the tool output, call `addToolOutput` without awaiting it inside
   * this callback. The callback's return value is not used.
   */
  onToolCall?: ChatOnToolCallCallback<UI_MESSAGE>;

  /**
   * Function that is called when the assistant response has finished streaming.
   */
  onFinish?: ChatOnFinishCallback<UI_MESSAGE>;

  /**
   * Optional callback function that is called when a data part is received.
   *
   * @param data The data part that was received.
   */
  onData?: ChatOnDataCallback<UI_MESSAGE>;

  /**
   * When provided, this function will be called when the stream is finished or a tool call is added
   * to determine if the current messages should be resubmitted.
   */
  sendAutomaticallyWhen?: (options: {
    messages: UI_MESSAGE[];
  }) => boolean | PromiseLike<boolean>;

  /**
   * Experimental. Queue messages that are sent while a response is in progress
   * or while the assistant waits for a tool result or approval, and send them
   * one at a time after each response finishes. Stopping, an error or an
   * interrupted response pauses the queue until the next message is sent.
   * Editing a message or regenerating clears the queue.
   *
   * @default false
   */
  experimental_queue?: boolean;
}

export abstract class AbstractChat<UI_MESSAGE extends UIMessage> {
  private _id: string | undefined;

  get id(): string {
    return (this._id ??= this.generateId());
  }

  readonly generateId: IdGenerator;

  protected state: ChatState<UI_MESSAGE>;

  private messageMetadataSchema:
    | FlexibleSchema<UI_MESSAGE['metadata']>
    | undefined;
  private dataPartSchemas:
    | UIDataTypesToSchemas<InferUIMessageData<UI_MESSAGE>>
    | undefined;
  private readonly transport: ChatTransport<UI_MESSAGE>;
  private onError?: ChatInit<UI_MESSAGE>['onError'];
  private onToolCall?: ChatInit<UI_MESSAGE>['onToolCall'];
  private onFinish?: ChatInit<UI_MESSAGE>['onFinish'];
  private onData?: ChatInit<UI_MESSAGE>['onData'];
  private sendAutomaticallyWhen?: ChatInit<UI_MESSAGE>['sendAutomaticallyWhen'];
  private queueEnabled: boolean;
  private queuedMessagesFallback: UI_MESSAGE[] = [];
  private queuedMessageOptions = new Map<string, ChatRequestOptions>();
  // a stop or an error pauses the queue. a paused response is not waiting for
  // the user, so resuming the queue skips that check:
  private isQueuePaused = false;
  private pendingAutomaticDecisions: number[] = [];
  // a user send that has to wait to send an answered approval first, with the
  // request options of that send:
  private deferredApprovalSend: { options?: ChatRequestOptions } | undefined;

  private pendingMessagePreparations = new Set<AbortController>();
  private pendingApprovalMessageId: string | undefined;
  // Keep interruption state after activeResponse is cleared so late tool updates
  // cannot automatically continue an interrupted message.
  private interruptedMessageIds = new Set<string>();
  private activeResponse: ActiveResponse<UI_MESSAGE> | undefined = undefined;
  private activeResumeRequest: ActiveResumeRequest | undefined = undefined;
  private resumableStreamState:
    | StreamingUIMessageState<UI_MESSAGE>
    | undefined = undefined;
  private jobExecutor = new SerialJobExecutor();
  private activeStopCount = 0;
  private stopGeneration = 0;

  constructor({
    generateId = generateIdFunc,
    id,
    transport = new DefaultChatTransport(),
    messageMetadataSchema,
    dataPartSchemas,
    state,
    onError,
    onToolCall,
    onFinish,
    onData,
    sendAutomaticallyWhen,
    experimental_queue = false,
  }: Omit<ChatInit<UI_MESSAGE>, 'messages'> & {
    state: ChatState<UI_MESSAGE>;
  }) {
    this._id = id;
    this.transport = transport;
    this.generateId = generateId;
    this.messageMetadataSchema = messageMetadataSchema;
    this.dataPartSchemas = dataPartSchemas;
    this.state = state;
    this.onError = onError;
    this.onToolCall = onToolCall;
    this.onFinish = onFinish;
    this.onData = onData;
    this.sendAutomaticallyWhen = sendAutomaticallyWhen;
    this.queueEnabled = experimental_queue;
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
    if (this.status === status) {
      if (this.error !== error) {
        this.state.error = error;
      }
      return;
    }

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

  /**
   * Experimental. Messages that wait to be sent when `experimental_queue` is
   * enabled, in the order they will be sent.
   */
  get experimental_queuedMessages(): UI_MESSAGE[] {
    return (
      this.state.experimental_queuedMessages ?? this.queuedMessagesFallback
    );
  }

  private setQueuedMessages(experimental_queuedMessages: UI_MESSAGE[]) {
    if ('experimental_queuedMessages' in this.state) {
      this.state.experimental_queuedMessages = experimental_queuedMessages;
    } else {
      this.queuedMessagesFallback = experimental_queuedMessages;
    }
  }

  /**
   * Experimental. Removes a queued message so it is not sent.
   */
  experimental_removeQueuedMessage = (id: string): void => {
    this.queuedMessageOptions.delete(id);
    this.setQueuedMessages(
      this.experimental_queuedMessages.filter(message => message.id !== id),
    );
  };

  /**
   * Experimental. Stops the response in progress and sends the queued message
   * with the given id next. The rest of the queue is sent after it.
   */
  experimental_sendQueuedMessageNow = async (id: string): Promise<void> => {
    const message = this.experimental_queuedMessages.find(
      message => message.id === id,
    );

    if (message == null) {
      return;
    }

    this.setQueuedMessages([
      message,
      ...this.experimental_queuedMessages.filter(queued => queued.id !== id),
    ]);

    await this.stop();
    await this.resumeQueue({
      skipWaitForUser: true,
      options: this.queuedMessageOptions.get(id),
    });
  };

  // the user sending a message resumes a paused queue (after a stop, an error
  // or an interruption). an answered approval that was not sent yet goes
  // first, the queue continues when its response finishes:
  private async resumeQueue({
    skipWaitForUser,
    options,
  }: {
    skipWaitForUser: boolean;
    options?: ChatRequestOptions;
  }): Promise<void> {
    this.isQueuePaused = false;

    if (this.hasUnsentApprovalResponse()) {
      if (!this.isRequestInProgress()) {
        await this.sendMessage(undefined, options);
        return;
      }

      // a pending sendAutomaticallyWhen decision can still send the approval.
      // if it does not, the queue sends it first when it settles:
      this.deferredApprovalSend = { options };
    }

    await this.settleQueue({ skipWaitForUser });
  }

  // editing a message or regenerating rewrites the history that the queued
  // messages were sent after, so they are dropped together with the response
  // in progress:
  private async clearQueueForHistoryChange(): Promise<void> {
    if (!this.queueEnabled) {
      return;
    }

    this.queuedMessageOptions.clear();
    this.setQueuedMessages([]);
    this.deferredApprovalSend = undefined;

    if (this.isRequestInProgress()) {
      await this.stop();
    }
  }

  // a pending sendAutomaticallyWhen decision can still start a request, so the
  // queue waits for it like for a response in progress. a stop invalidates the
  // decisions that were pending, so they no longer hold the queue:
  private isRequestInProgress(): boolean {
    return (
      this.pendingAutomaticDecisions.includes(this.stopGeneration) ||
      this.activeResponse != null ||
      this.status === 'submitted' ||
      this.status === 'streaming'
    );
  }

  // the assistant waits for the user when the last message has a tool call
  // without a result or an approval that has not been sent yet:
  private isWaitingForUser(): boolean {
    const lastMessage = this.lastMessage;

    return (
      lastMessage?.role === 'assistant' &&
      lastMessage.parts.some(
        part =>
          isToolUIPart(part) &&
          (part.state === 'approval-requested' ||
            part.state === 'approval-responded' ||
            (!part.providerExecuted &&
              (part.state === 'input-streaming' ||
                part.state === 'input-available'))),
      )
    );
  }

  // an answered approval has to reach the model before the next user message,
  // otherwise its tool call is left without a result:
  private hasUnsentApprovalResponse(): boolean {
    const lastMessage = this.lastMessage;

    return (
      lastMessage?.role === 'assistant' &&
      lastMessage.parts.some(
        part => isToolUIPart(part) && part.state === 'approval-responded',
      ) &&
      !lastMessage.parts.some(
        part =>
          isToolUIPart(part) &&
          (part.state === 'approval-requested' ||
            (!part.providerExecuted &&
              (part.state === 'input-streaming' ||
                part.state === 'input-available'))),
      )
    );
  }

  // every path that can leave the chat idle ends here. the queue then either
  // sends its next message, stays paused until the user sends again, or waits
  // for the user to answer a tool call. a stop that happened after the caller
  // captured `stopGeneration` cancels the send:
  private async settleQueue({
    stopGeneration = this.stopGeneration,
    skipWaitForUser = false,
  }: {
    stopGeneration?: number;
    skipWaitForUser?: boolean;
  } = {}): Promise<void> {
    if (
      this.isQueuePaused ||
      this.isRequestInProgress() ||
      this.activeStopCount > 0 ||
      stopGeneration !== this.stopGeneration
    ) {
      return;
    }

    const deferredApprovalSend = this.deferredApprovalSend;
    this.deferredApprovalSend = undefined;
    if (deferredApprovalSend != null && this.hasUnsentApprovalResponse()) {
      await this.sendMessage(undefined, deferredApprovalSend.options);
      return;
    }

    const [message, ...rest] = this.experimental_queuedMessages;

    if (message == null || (!skipWaitForUser && this.isWaitingForUser())) {
      return;
    }

    const options = this.queuedMessageOptions.get(message.id);
    this.queuedMessageOptions.delete(message.id);
    this.setQueuedMessages(rest);

    this.state.pushMessage(message);

    await this.makeRequest({ trigger: 'submit-message', ...options });
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
      let messageId = this.pendingApprovalMessageId;

      if (messageId == null) {
        messageId = this.lastMessage?.id;

        // When hydrating a chat with an already-responded approval, continue
        // the most recent matching assistant message so result chunks can
        // resolve its tool invocation.
        for (let i = this.state.messages.length - 1; i >= 0; i--) {
          const candidate = this.state.messages[i];
          if (
            candidate.role === 'assistant' &&
            candidate.parts.some(
              part => isToolUIPart(part) && part.state === 'approval-responded',
            )
          ) {
            messageId = candidate.id;
            break;
          }
        }
      }

      const consumesPendingApproval =
        messageId != null && messageId === this.pendingApprovalMessageId;
      const pendingApprovalMessageIndex = consumesPendingApproval
        ? this.state.messages.findIndex(message => message.id === messageId)
        : -1;

      await this.makeRequestForToolApproval({
        messageId,
        messageIndex: pendingApprovalMessageIndex,
        ...options,
      });
      return;
    }

    let uiMessage: CreateUIMessage<UI_MESSAGE>;

    if ('text' in message || 'files' in message) {
      const abortController = new AbortController();
      this.pendingMessagePreparations.add(abortController);

      let fileParts: FileUIPart[];
      try {
        fileParts = Array.isArray(message.files)
          ? message.files
          : await convertFileListToFileUIParts(message.files);
      } finally {
        this.pendingMessagePreparations.delete(abortController);
      }

      if (abortController.signal.aborted) {
        return;
      }

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

    if (
      this.queueEnabled &&
      message.messageId == null &&
      (this.isRequestInProgress() ||
        this.isWaitingForUser() ||
        this.experimental_queuedMessages.length > 0)
    ) {
      const queuedMessage = {
        ...uiMessage,
        id: uiMessage.id ?? this.generateId(),
        role: uiMessage.role ?? 'user',
        metadata: message.metadata,
      } as UI_MESSAGE;

      if (options != null) {
        this.queuedMessageOptions.set(queuedMessage.id, options);
      }
      this.setQueuedMessages([
        ...this.experimental_queuedMessages,
        queuedMessage,
      ]);

      // a stopped response is not waiting for the user anymore, so resuming a
      // paused queue skips that check:
      await this.resumeQueue({
        skipWaitForUser: this.isQueuePaused,
        options,
      });
      return;
    }

    if (message.messageId != null) {
      await this.clearQueueForHistoryChange();

      const messageIndex = this.state.messages.findIndex(
        m => m.id === message.messageId,
      );

      if (messageIndex === -1) {
        throw new InvalidArgumentError({
          parameter: 'message.messageId',
          value: message.messageId,
          message: `message with id ${message.messageId} not found`,
        });
      }

      if (this.state.messages[messageIndex].role !== 'user') {
        throw new InvalidArgumentError({
          parameter: 'message.messageId',
          value: message.messageId,
          message: `message with id ${message.messageId} is not a user message`,
        });
      }

      // remove all messages after the message with the given id
      this.state.messages = this.state.messages.slice(0, messageIndex + 1);

      // update the message with the new content
      this.state.replaceMessage(messageIndex, {
        id: message.messageId,
        ...uiMessage,
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

    // sending a new message is the user taking over after a stop or an error:
    this.isQueuePaused = false;

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
    await this.clearQueueForHistoryChange();

    const messageIndex =
      messageId == null
        ? this.state.messages.length - 1
        : this.state.messages.findIndex(message => message.id === messageId);

    if (messageIndex === -1) {
      throw new InvalidArgumentError({
        parameter: 'messageId',
        value: messageId,
        message: `message ${messageId} not found`,
      });
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

  /**
   * Resume the stream if the latest response ended with a resumable network
   * disconnect. If a response is still active, wait for it to settle first so
   * disconnects reported shortly after the caller's trigger are handled.
   *
   * @internal
   */
  '~resumeStreamIfDisconnected' = async ({
    shouldResume = () => true,
  }: {
    shouldResume?: () => boolean;
  } = {}): Promise<void> => {
    const activeResponse = this.activeResponse;

    if (this.resumableStreamState == null && activeResponse != null) {
      await activeResponse.completionPromise;

      if (this.resumableStreamState !== activeResponse.state) {
        return;
      }
    }

    if (this.resumableStreamState != null && shouldResume()) {
      await this.resumeStream();
    }
  };

  /**
   * Clear the error state and set the status to ready if the chat is in an error state.
   */
  clearError = () => {
    if (this.status === 'error') {
      this.state.error = undefined;
      this.setStatus({ status: 'ready' });
    }
  };

  addToolApprovalResponse: ChatAddToolApproveResponseFunction = async ({
    id,
    approved,
    reason,
    options,
  }) =>
    this.jobExecutor.run(async () => {
      const stopGeneration = this.stopGeneration;
      const messages = this.state.messages;

      const updatePart = (
        part: UIMessagePart<UIDataTypes, UITools>,
      ): UIMessagePart<UIDataTypes, UITools> =>
        isToolUIPart(part) &&
        part.state === 'approval-requested' &&
        part.approval.id === id
          ? {
              ...part,
              state: 'approval-responded',
              approval: { ...part.approval, id, approved, reason },
            }
          : part;

      const messageIndex = messages.findIndex(message =>
        message.parts.some(
          part =>
            isToolUIPart(part) &&
            part.state === 'approval-requested' &&
            part.approval.id === id,
        ),
      );

      if (messageIndex !== -1) {
        const message = messages[messageIndex];

        // update the message to trigger an immediate UI update
        this.state.replaceMessage(messageIndex, {
          ...message,
          parts: message.parts.map(updatePart),
        });
        this.pendingApprovalMessageId = message.id;
      }

      // update the active response if it exists
      if (this.activeResponse) {
        this.activeResponse.state.message.parts =
          this.activeResponse.state.message.parts.map(updatePart);
      }

      // automatically send the message if the sendAutomaticallyWhen function returns true
      if (
        messageIndex !== -1 &&
        this.status !== 'streaming' &&
        this.status !== 'submitted' &&
        this.sendAutomaticallyWhen
      ) {
        const shouldSend = await this.shouldSendAutomatically(
          messages[messageIndex].id,
        );

        if (shouldSend) {
          // no await to avoid deadlocking
          void this.runAutomaticRequest(() => {
            const messageId =
              messageIndex === -1
                ? this.lastMessage?.id
                : messages[messageIndex].id;

            return this.makeRequestForToolApproval({
              messageId,
              messageIndex,
              ...options,
            });
          }, shouldSend);
          return;
        }
      }

      // no await to avoid deadlocking
      void this.settleQueue({ stopGeneration });
    });

  addToolOutput: ChatAddToolOutputFunction<UI_MESSAGE> = async ({
    state,
    toolCallId,
    output,
    errorText,
    options,
  }) =>
    this.jobExecutor.run(async () => {
      const stopGeneration = this.stopGeneration;
      const messages = this.state.messages;

      const updatePart = (
        part: UIMessagePart<UIDataTypes, UITools>,
      ): UIMessagePart<UIDataTypes, UITools> => {
        if (!isToolUIPart(part) || part.toolCallId !== toolCallId) {
          return part;
        }

        // Output states can only retain approvals that were granted.
        const { approval: existingApproval, ...toolPart } = part;
        const approval =
          existingApproval?.approved === true
            ? {
                approval: {
                  ...existingApproval,
                  approved: existingApproval.approved,
                },
              }
            : {};

        return state === 'output-error'
          ? {
              ...toolPart,
              ...approval,
              state,
              input: part.input,
              output: undefined,
              errorText,
            }
          : {
              ...toolPart,
              ...approval,
              state: 'output-available',
              input: part.input,
              output,
              errorText: undefined,
            };
      };

      const messageIndex = messages.findIndex(message =>
        message.parts.some(
          part => isToolUIPart(part) && part.toolCallId === toolCallId,
        ),
      );

      if (messageIndex !== -1) {
        const message = messages[messageIndex];

        // update the message to trigger an immediate UI update
        this.state.replaceMessage(messageIndex, {
          ...message,
          parts: message.parts.map(updatePart),
        });
      }

      // update the active response if it exists
      if (this.activeResponse) {
        this.activeResponse.state.message.parts =
          this.activeResponse.state.message.parts.map(updatePart);
      }

      // automatically send the message if the sendAutomaticallyWhen function returns true
      if (
        messageIndex !== -1 &&
        this.status !== 'streaming' &&
        this.status !== 'submitted' &&
        this.sendAutomaticallyWhen
      ) {
        const shouldSend = await this.shouldSendAutomatically(
          messages[messageIndex].id,
        );

        if (shouldSend) {
          // no await to avoid deadlocking
          void this.runAutomaticRequest(
            () =>
              this.makeRequest({
                trigger: 'submit-message',
                messageId: messages[messageIndex].id,
                ...options,
              }),
            shouldSend,
          );
          return;
        }
      }

      // the tool result can be what the queue was waiting for. no await to
      // avoid deadlocking:
      void this.settleQueue({ stopGeneration });
    });

  /** @deprecated Use addToolOutput */
  addToolResult = this.addToolOutput;

  /**
   * Abort the current request, keep the generated tokens if any, and wait for
   * the request pipeline to finish.
   */
  stop = async () => {
    this.activeStopCount++;
    this.stopGeneration++;
    this.deferredApprovalSend = undefined;

    try {
      const activeResumeRequest = this.activeResumeRequest;
      const activeResponse = this.activeResponse;

      for (const controller of this.pendingMessagePreparations) {
        controller.abort();
      }
      activeResumeRequest?.abortController.abort();
      activeResponse?.abortController.abort();

      await Promise.all([
        activeResumeRequest?.completionPromise,
        activeResponse?.completionPromise,
      ]);

      // Stream cancellation can complete while a processing job is still
      // blocked in onToolCall. Drain that job and any message update it queued.
      await this.jobExecutor.waitForIdle();

      // a stop pauses the queue even when no response was running, e.g. while
      // the assistant waits for a tool approval:
      this.isQueuePaused = true;
    } finally {
      this.activeStopCount--;
    }
  };

  /**
   * Stops active work and releases resources owned by the chat transport.
   */
  dispose = async (): Promise<void> => {
    await this.stop();
    this.transport.close?.();
  };

  private async shouldSendAutomatically(
    messageId = this.lastMessage?.id,
  ): Promise<boolean> {
    const isInterrupted = (id: string | undefined) =>
      id != null && this.interruptedMessageIds.has(id);

    if (
      !this.sendAutomaticallyWhen ||
      isInterrupted(messageId) ||
      isInterrupted(this.lastMessage?.id)
    ) {
      return false;
    }

    const stopGeneration = this.stopGeneration;
    this.pendingAutomaticDecisions.push(stopGeneration);
    let result: boolean;
    try {
      result = await this.sendAutomaticallyWhen({
        messages: this.state.messages,
      });
    } finally {
      this.pendingAutomaticDecisions.splice(
        this.pendingAutomaticDecisions.indexOf(stopGeneration),
        1,
      );
    }

    return (
      result &&
      !isInterrupted(messageId) &&
      !isInterrupted(this.lastMessage?.id)
    );
  }

  private async runAutomaticRequest(
    request: () => Promise<void>,
    shouldSend?: boolean,
  ): Promise<boolean> {
    const stopGeneration = this.stopGeneration;
    const startedWhileStopping = this.activeStopCount > 0;

    if (!(shouldSend ?? (await this.shouldSendAutomatically()))) {
      return false;
    }

    // A stop invalidates automatic requests that were pending when it started,
    // including requests queued by callback-driven tool updates.
    if (
      startedWhileStopping ||
      stopGeneration !== this.stopGeneration ||
      this.activeStopCount > 0
    ) {
      return false;
    }

    await request();
    return true;
  }

  private async makeRequestForToolApproval({
    messageId,
    messageIndex,
    ...options
  }: {
    messageId?: string;
    messageIndex: number;
  } & ChatRequestOptions) {
    this.deferredApprovalSend = undefined;

    const consumesPendingApproval =
      messageId != null && messageId === this.pendingApprovalMessageId;
    if (consumesPendingApproval) {
      this.pendingApprovalMessageId = undefined;
    }

    await this.makeRequest({
      trigger: 'submit-message',
      messageId,
      ...options,
    });

    if (
      consumesPendingApproval &&
      this.status === 'error' &&
      this.pendingApprovalMessageId == null
    ) {
      this.pendingApprovalMessageId =
        this.state.messages[messageIndex]?.id ?? messageId;
    }
  }

  private async makeRequest(options: MakeRequestOptions) {
    const completion = createResolvablePromise<void>();

    try {
      await this.makeRequestImpl({
        ...options,
        completionPromise: completion.promise,
      });
    } finally {
      completion.resolve();
    }
  }

  private async makeRequestImpl({
    trigger,
    metadata,
    headers,
    body,
    messageId,
    completionPromise,
  }: MakeRequestOptions & {
    completionPromise: Promise<void>;
  }) {
    if (trigger !== 'resume-stream') {
      this.resumableStreamState = undefined;
    }

    const abortController = new AbortController();
    const activeResumeRequest =
      trigger === 'resume-stream'
        ? { abortController, completionPromise }
        : undefined;

    if (activeResumeRequest) {
      this.activeResumeRequest?.abortController.abort();
      this.activeResumeRequest = activeResumeRequest;
    }

    const isCurrentRequest = () =>
      activeResumeRequest == null ||
      this.activeResumeRequest === activeResumeRequest;

    const clearActiveResumeRequest = () => {
      if (this.activeResumeRequest === activeResumeRequest) {
        this.activeResumeRequest = undefined;
      }
    };

    // For resume-stream, check if there's an active stream before
    // changing status. This avoids a brief flash of 'submitted' status
    // when there is no stream to resume (e.g. on page load).
    let resumeStream: ReadableStream<UIMessageChunk> | undefined;
    if (trigger === 'resume-stream') {
      try {
        const reconnect = await this.transport.reconnectToStream({
          chatId: this.id,
          abortSignal: abortController.signal,
          metadata,
          headers,
          body,
        });

        if (abortController.signal.aborted || !isCurrentRequest()) {
          await reconnect?.cancel().catch(() => {});
          if (isCurrentRequest()) {
            this.setStatus({ status: 'ready' });
            this.resumableStreamState = undefined;
          }
          clearActiveResumeRequest();
          return;
        }

        if (reconnect == null) {
          this.setStatus({ status: 'ready' });
          this.resumableStreamState = undefined;
          clearActiveResumeRequest();
          return; // no active stream found, so we do not resume
        }

        resumeStream = reconnect;
      } catch (err) {
        if (
          abortController.signal.aborted ||
          (err as { name?: string }).name === 'AbortError'
        ) {
          if (isCurrentRequest()) {
            this.setStatus({ status: 'ready' });
            this.resumableStreamState = undefined;
          }
          clearActiveResumeRequest();
          return;
        }

        if (!isCurrentRequest()) {
          return;
        }

        if (this.onError && err instanceof Error) {
          this.onError(err);
        }
        this.setStatus({ status: 'error', error: err as Error });
        clearActiveResumeRequest();
        return;
      }
    }

    this.setStatus({ status: 'submitted', error: undefined });

    const lastMessage = this.lastMessage;
    const responseMessageIndex =
      trigger === 'submit-message' && messageId != null
        ? this.state.messages.findIndex(message => message.id === messageId)
        : this.state.messages.length - 1;
    const responseMessage =
      responseMessageIndex === -1
        ? lastMessage
        : this.state.messages[responseMessageIndex];
    const originalResponseMessageId = responseMessage?.id;
    // The continued stream can start with input deltas or a tool result.
    // Keep unfinished tool parts so result chunks can find their tool call.
    const resumableResponseMessage =
      trigger === 'resume-stream' &&
      responseMessage?.role === 'assistant' &&
      responseMessage.parts.some(
        part =>
          isToolUIPart(part) &&
          (part.state === 'input-streaming' ||
            (part.state === 'input-available' && part.providerExecuted) ||
            part.state === 'approval-responded'),
      )
        ? this.state.snapshot(responseMessage)
        : undefined;
    const usesEarlierAssistantMessage =
      responseMessageIndex !== -1 &&
      responseMessageIndex < this.state.messages.length - 1 &&
      responseMessage?.role === 'assistant';

    let isAbort = false;
    let isDisconnect = false;
    let isError = false;
    let activeResponse: ActiveResponse<UI_MESSAGE> | undefined;

    try {
      const response = {
        state:
          trigger === 'resume-stream' && this.resumableStreamState != null
            ? this.resumableStreamState
            : createStreamingUIMessageState({
                lastMessage:
                  trigger === 'resume-stream'
                    ? resumableResponseMessage
                    : trigger === 'regenerate-message'
                      ? undefined
                      : this.state.snapshot(responseMessage),
                messageId: this.generateId(),
              }),
        abortController,
        completionPromise,
      } as ActiveResponse<UI_MESSAGE>;

      activeResponse = response;

      response.abortController.signal.addEventListener('abort', () => {
        isAbort = true;
      });

      this.activeResponse = response;

      let stream: ReadableStream<UIMessageChunk>;

      if (trigger === 'resume-stream') {
        stream = resumeStream!;
      } else {
        stream = await this.transport.sendMessages({
          chatId: this.id,
          messages: this.state.messages,
          abortSignal: response.abortController.signal,
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
          write: (options?: UIMessageStreamWriteOptions) => void;
        }) => Promise<void>,
      ) =>
        // serialize the job execution to avoid race conditions:
        this.jobExecutor.run(() => {
          if (response.abortController.signal.aborted) {
            return Promise.resolve();
          }

          return job({
            state: response.state,
            write: ({ updateStatus = true } = {}) => {
              if (response.abortController.signal.aborted) {
                return;
              }

              if (updateStatus) {
                this.setStatus({ status: 'streaming' });
              }

              const existingMessageIndex = this.state.messages.findLastIndex(
                message => message.id === response.state.message.id,
              );

              if (existingMessageIndex !== -1) {
                this.state.replaceMessage(
                  existingMessageIndex,
                  response.state.message,
                );
              } else if (usesEarlierAssistantMessage) {
                const originalMessageIndex = this.state.messages.findLastIndex(
                  message => message.id === originalResponseMessageId,
                );

                if (originalMessageIndex !== -1) {
                  this.state.replaceMessage(
                    originalMessageIndex,
                    response.state.message,
                  );
                } else {
                  this.state.pushMessage(response.state.message);
                }
              } else {
                this.state.pushMessage(response.state.message);
              }
            },
          });
        });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          resetStateOnMessageIdChange: trigger === 'resume-stream',
          resetStateOnFirstMessageStart:
            trigger === 'resume-stream' && this.transport.resumeStreamIsReplay,
          onToolCall: this.onToolCall,
          onData: this.onData,
          messageMetadataSchema: this.messageMetadataSchema,
          dataPartSchemas: this.dataPartSchemas,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
        abortSignal: response.abortController.signal,
        onError: error => {
          throw error;
        },
      });

      if (isAbort) {
        if (isCurrentRequest()) {
          this.setStatus({ status: 'ready' });
          if (this.resumableStreamState === response.state) {
            this.resumableStreamState = undefined;
          }
        }
        return null;
      }

      if (isCurrentRequest()) {
        this.setStatus({ status: 'ready' });
        if (this.resumableStreamState === response.state) {
          this.resumableStreamState = undefined;
        }
      }
    } catch (err) {
      // Ignore abort errors as they are expected.
      if (isAbort || (err as any).name === 'AbortError') {
        isAbort = true;
        if (isCurrentRequest()) {
          this.setStatus({ status: 'ready' });
          if (this.resumableStreamState === activeResponse?.state) {
            this.resumableStreamState = undefined;
          }
        }
        return null;
      }

      if (!isCurrentRequest()) {
        return null;
      }

      isError = true;

      if (err instanceof TypeError) {
        const message = err.message.toLowerCase();

        isDisconnect =
          // Chromium request failures; Node.js fetch failures.
          message.includes('fetch') ||
          // Firefox request failures; Chromium response-body failures.
          message.includes('network') ||
          // Safari/WebKit request and response-body failures.
          message === 'load failed';
      }

      if (isDisconnect) {
        this.resumableStreamState = activeResponse?.state;
      } else if (this.resumableStreamState === activeResponse?.state) {
        this.resumableStreamState = undefined;
      }

      if (this.onError && err instanceof Error) {
        this.onError(err);
      }

      this.setStatus({ status: 'error', error: err as Error });
    } finally {
      try {
        if (activeResponse) {
          const { message, finishReason } = activeResponse.state;
          if (finishReason === 'interrupted') {
            this.interruptedMessageIds.add(message.id);
          } else if (!isAbort && !isError) {
            this.interruptedMessageIds.delete(message.id);
          }

          this.onFinish?.({
            message: activeResponse.state.message,
            messages: this.state.messages,
            isAbort,
            isDisconnect,
            isError,
            finishReason: activeResponse.state.finishReason,
          });
        }
      } finally {
        // a response that did not finish (stopped, failed or interrupted)
        // pauses the queue until the user sends again. a response that finishes
        // on its own (e.g. an automatic resume) never clears the pause:
        if (
          isAbort ||
          isError ||
          activeResponse?.state.finishReason === 'interrupted'
        ) {
          this.isQueuePaused = true;
        }

        if (this.activeResponse === activeResponse) {
          this.activeResponse = undefined;
        }

        clearActiveResumeRequest();
      }
    }

    // automatically send the message if the sendAutomaticallyWhen function returns true
    if (
      !isAbort &&
      !isError &&
      activeResponse?.state.finishReason !== 'interrupted'
    ) {
      const stopGeneration = this.stopGeneration;
      const sentAutomatically = await this.runAutomaticRequest(() =>
        this.makeRequest({
          trigger: 'submit-message',
          messageId: this.lastMessage?.id,
          metadata,
          headers,
          body,
        }),
      );

      // the automatic request settles the queue when it finishes. a stop while
      // sendAutomaticallyWhen was pending cancels the send too, so a stopped or
      // replaced chat never sends queued messages on its own:
      if (!sentAutomatically) {
        await this.settleQueue({ stopGeneration });
      }
    }
  }
}
