import {
  AbstractChat,
  type ChatInit as BaseChatInit,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type UIMessage,
} from 'ai';
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type ShallowRef,
} from 'vue';

function cloneMetadata<METADATA>(metadata: METADATA): METADATA {
  if (Array.isArray(metadata)) {
    return [...metadata] as METADATA;
  }

  if (
    metadata != null &&
    typeof metadata === 'object' &&
    (Object.getPrototypeOf(metadata) === Object.prototype ||
      Object.getPrototypeOf(metadata) === null)
  ) {
    return { ...metadata } as METADATA;
  }

  return metadata;
}

function snapshotValue<T>(value: T): T {
  if (
    value == null ||
    typeof value !== 'object' ||
    !('parts' in value) ||
    !Array.isArray(value.parts)
  ) {
    return value;
  }

  const message = value as unknown as UIMessage;
  const snapshot = {
    ...message,
    parts: message.parts.map(part => ({ ...part })),
  };

  if ('metadata' in message) {
    snapshot.metadata = cloneMetadata(message.metadata);
  }

  return snapshot as T;
}

class VueChatState<
  UI_MESSAGE extends UIMessage,
> implements ChatState<UI_MESSAGE> {
  private messagesValue: UI_MESSAGE[];
  private publishedMessages: UI_MESSAGE[] = [];
  private publishedMessageSources: UI_MESSAGE[] = [];
  private readonly dirtyMessageIndices = new Set<number>();
  private statusValue: ChatStatus = 'ready';
  private errorValue: Error | undefined;
  private readonly throttleWaitMs: number | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private hasPendingPublication = false;
  private isActive = true;

  isPublishing = false;

  constructor({
    initialMessages,
    messagesRef,
    statusRef,
    errorRef,
    throttleWaitMs,
  }: {
    initialMessages: UI_MESSAGE[];
    messagesRef: ShallowRef<UI_MESSAGE[]>;
    statusRef: ShallowRef<ChatStatus>;
    errorRef: ShallowRef<Error | undefined>;
    throttleWaitMs?: number;
  }) {
    this.messagesValue = initialMessages;
    this.messagesRef = messagesRef;
    this.statusRef = statusRef;
    this.errorRef = errorRef;
    this.throttleWaitMs =
      throttleWaitMs != null &&
      Number.isFinite(throttleWaitMs) &&
      throttleWaitMs > 0
        ? throttleWaitMs
        : undefined;
  }

  private readonly messagesRef: ShallowRef<UI_MESSAGE[]>;
  private readonly statusRef: ShallowRef<ChatStatus>;
  private readonly errorRef: ShallowRef<Error | undefined>;

  get messages(): UI_MESSAGE[] {
    return this.messagesValue;
  }

  set messages(messages: UI_MESSAGE[]) {
    const previousMessages = this.messagesValue;
    this.messagesValue = messages;

    for (let index = 0; index < messages.length; index++) {
      if (messages[index] !== previousMessages[index]) {
        this.dirtyMessageIndices.add(index);
      }
    }

    this.schedulePublication();
  }

  get status(): ChatStatus {
    return this.statusValue;
  }

  set status(status: ChatStatus) {
    this.statusValue = status;

    if (!this.isActive) {
      return;
    }

    if (status === 'ready' || status === 'error') {
      // Terminal states must never become observable before the final message.
      this.flushPublication();
    }

    this.statusRef.value = status;
  }

  get error(): Error | undefined {
    return this.errorValue;
  }

  set error(error: Error | undefined) {
    this.errorValue = error;

    if (this.isActive) {
      this.errorRef.value = error;
    }
  }

  pushMessage = (message: UI_MESSAGE) => {
    this.messagesValue.push(message);
    this.dirtyMessageIndices.add(this.messagesValue.length - 1);
    this.schedulePublication();
  };

  popMessage = () => {
    this.messagesValue.pop();
    this.schedulePublication();
  };

  replaceMessage = (index: number, message: UI_MESSAGE) => {
    this.messagesValue[index] = message;
    this.dirtyMessageIndices.add(index);
    this.schedulePublication();
  };

  snapshot = snapshotValue;

  publishInitialState() {
    this.publishMessages();
    this.statusRef.value = this.statusValue;
    this.errorRef.value = this.errorValue;
  }

  setMessagesFromConsumer(messages: UI_MESSAGE[]) {
    this.messagesValue = messages;
    this.publishedMessages = messages;
    this.publishedMessageSources = messages;
    this.dirtyMessageIndices.clear();
  }

  dispose() {
    this.isActive = false;
    this.hasPendingPublication = false;
    this.dirtyMessageIndices.clear();
    this.publishedMessages = [];
    this.publishedMessageSources = [];

    if (this.timeout != null) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  private schedulePublication() {
    if (!this.isActive) {
      return;
    }

    if (this.throttleWaitMs == null) {
      this.publishMessages();
      return;
    }

    if (this.timeout == null) {
      // Publish the leading update immediately, then coalesce updates until
      // the next interval boundary.
      this.publishMessages();
      this.timeout = setTimeout(this.handleIntervalEnd, this.throttleWaitMs);
    } else {
      this.hasPendingPublication = true;
    }
  }

  private readonly handleIntervalEnd = () => {
    this.timeout = undefined;

    if (!this.isActive || !this.hasPendingPublication) {
      return;
    }

    this.hasPendingPublication = false;
    this.publishMessages();
    this.timeout = setTimeout(this.handleIntervalEnd, this.throttleWaitMs);
  };

  private flushPublication() {
    if (this.timeout != null) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }

    this.hasPendingPublication = false;
    this.publishMessages();
  }

  private publishMessages() {
    if (!this.isActive) {
      return;
    }

    const publishedMessages = this.messagesValue.map((message, index) =>
      this.dirtyMessageIndices.has(index) ||
      this.publishedMessageSources[index] !== message
        ? snapshotValue(message)
        : this.publishedMessages[index],
    );

    this.publishedMessages = publishedMessages;
    this.publishedMessageSources = [...this.messagesValue];
    this.dirtyMessageIndices.clear();

    this.isPublishing = true;
    try {
      this.messagesRef.value = publishedMessages;
    } finally {
      this.isPublishing = false;
    }
  }
}

/**
 * @internal
 */
export class VueChat<
  UI_MESSAGE extends UIMessage,
> extends AbstractChat<UI_MESSAGE> {
  constructor({
    state,
    ...init
  }: Omit<ChatInit<UI_MESSAGE>, 'messages'> & {
    state: ChatState<UI_MESSAGE>;
  }) {
    super({
      ...init,
      state,
    });
  }
}

/**
 * Return type of the {@link useChat} composable, which includes the chat
 * instance methods and reactive properties for messages, status, and error.
 */
export interface UseChatHelpers<UI_MESSAGE extends UIMessage> extends Pick<
  AbstractChat<UI_MESSAGE>,
  | 'sendMessage'
  | 'regenerate'
  | 'stop'
  | 'resumeStream'
  | 'addToolOutput'
  | 'addToolApprovalResponse'
  | 'clearError'
> {
  /**
   * The id of the chat.
   */
  id: ComputedRef<string>;

  /**
   * The current error state of the chat, if any.
   */
  error: ShallowRef<Error | undefined>;

  /**
   * The current status of the chat, which can be 'ready', 'generating', 'streaming', or 'error'.
   */
  status: ShallowRef<ChatStatus>;

  /**
   * The list of messages in the chat, which can be updated by the chat instance methods or directly by setting this property.
   */
  messages: ShallowRef<UI_MESSAGE[]>;
}

export type UseChatOptions<UI_MESSAGE extends UIMessage> =
  BaseChatInit<UI_MESSAGE> & {
    /**
     * Custom throttle wait time in milliseconds for reactive message updates.
     * Positive values enable throttling. Defaults to undefined, which disables
     * throttling.
     */
    throttle?: number;
  };

/**
 * Composable to access messages, status, and other chat properties and
 * methods. Accepts an optional reactive initial configuration object
 *
 * @example
 *
 * ```ts
 * // passing a getter if any reactive properties are used within
 * // the init object
 * const { messages, sendMessage } = useChat(() => ({
 *   // ...
 * })
 * ```
 *
 * @see BaseChatInit
 */
export function useChat<UI_MESSAGE extends UIMessage = UIMessage>(
  init?: MaybeRefOrGetter<UseChatOptions<UI_MESSAGE>>,
): UseChatHelpers<UI_MESSAGE> {
  const messages = shallowRef<UI_MESSAGE[]>([]);
  const status = shallowRef<ChatStatus>('ready');
  const error = shallowRef<Error | undefined>();

  // the instance is created right away thanks to immediate: true. We do it this
  // way instead of a computed to ensure all changes to reactive state happen
  // in the same tick
  const chatInstance = shallowRef<VueChat<UI_MESSAGE>>() as ShallowRef<
    VueChat<UI_MESSAGE>
  >;
  let chatState: VueChatState<UI_MESSAGE> | undefined;
  let currentTransport: ChatInit<UI_MESSAGE>['transport'];

  watch(
    messages,
    messageList => {
      if (chatState != null && !chatState.isPublishing) {
        chatState.setMessagesFromConsumer(messageList);
      }
    },
    { flush: 'sync' },
  );

  watch(
    () => toValue(init),
    opts => {
      currentTransport?.close?.();
      chatState?.dispose();

      const { throttle, ...chatInit } = opts ?? {};
      currentTransport = chatInit.transport;
      const nextChatState = new VueChatState<UI_MESSAGE>({
        initialMessages: chatInit.messages ?? [],
        messagesRef: messages,
        statusRef: status,
        errorRef: error,
        throttleWaitMs: throttle,
      });

      chatState = nextChatState;
      nextChatState.publishInitialState();

      chatInstance.value = new VueChat<UI_MESSAGE>({
        ...chatInit,
        state: nextChatState,
      });
    },
    { immediate: true },
  );

  if (getCurrentScope() != null) {
    onScopeDispose(() => {
      currentTransport?.close?.();
      chatState?.dispose();
    });
  }

  return {
    id: computed(() => chatInstance.value.id),
    status,
    messages,
    error,
    addToolApprovalResponse: opts =>
      chatInstance.value.addToolApprovalResponse(opts),
    addToolOutput: opts => chatInstance.value.addToolOutput(opts),
    clearError: () => chatInstance.value.clearError(),
    regenerate: opts => chatInstance.value.regenerate(opts),
    sendMessage: (...args) => chatInstance.value.sendMessage(...args),
    stop: () => chatInstance.value.stop(),
    resumeStream: opts => chatInstance.value.resumeStream(opts),
  };
}
