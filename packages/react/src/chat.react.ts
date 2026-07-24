import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type UIMessage,
} from 'ai';
import { throttle } from './throttle';

class ReactChatState<
  UI_MESSAGE extends UIMessage,
> implements ChatState<UI_MESSAGE> {
  // Internal, always-current message buffer. Every read/write from
  // `AbstractChat` (slicing, finding, replacing during streaming) goes through
  // this, so the chat logic always sees the latest messages.
  #messages: UI_MESSAGE[];

  // The message array reference published to React via
  // `useSyncExternalStore`'s `getSnapshot`. It is only swapped when
  // `#publishMessages` runs, so between throttle windows `getSnapshot` keeps
  // returning the same reference and React does not force a re-render.
  #messagesSnapshot: UI_MESSAGE[];

  #status: ChatStatus = 'ready';
  #error: Error | undefined = undefined;

  #messagesCallbacks = new Set<() => void>();
  #statusCallbacks = new Set<() => void>();
  #errorCallbacks = new Set<() => void>();

  // The throttle window currently configured for message updates.
  #throttleWaitMs: number | undefined = undefined;

  // Throttled version of `#publishMessages`, rebuilt whenever the throttle
  // window changes. When no throttling is configured this is `#publishMessages`
  // itself, so publishing happens synchronously.
  #throttledPublishMessages: () => void = () => this.#publishMessages();

  constructor(initialMessages: UI_MESSAGE[] = []) {
    this.#messages = initialMessages;
    this.#messagesSnapshot = initialMessages;
  }

  get status(): ChatStatus {
    return this.#status;
  }

  set status(newStatus: ChatStatus) {
    this.#status = newStatus;
    this.#callStatusCallbacks();
  }

  get error(): Error | undefined {
    return this.#error;
  }

  set error(newError: Error | undefined) {
    this.#error = newError;
    this.#callErrorCallbacks();
  }

  get messages(): UI_MESSAGE[] {
    return this.#messages;
  }

  set messages(newMessages: UI_MESSAGE[]) {
    this.#messages = [...newMessages];
    this.#scheduleMessagesPublish();
  }

  /**
   * The message array reference published to React. It stays stable between
   * throttle windows so that `useSyncExternalStore`'s `getSnapshot` does not
   * trip a re-render for updates that have not been flushed yet.
   */
  get messagesSnapshot(): UI_MESSAGE[] {
    return this.#messagesSnapshot;
  }

  pushMessage = (message: UI_MESSAGE) => {
    this.#messages = this.#messages.concat(message);
    this.#scheduleMessagesPublish();
  };

  popMessage = () => {
    this.#messages = this.#messages.slice(0, -1);
    this.#scheduleMessagesPublish();
  };

  replaceMessage = (index: number, message: UI_MESSAGE) => {
    this.#messages = [
      ...this.#messages.slice(0, index),
      // We deep clone the message here to ensure the new React Compiler (currently in RC) detects deeply nested parts/metadata changes:
      this.snapshot(message),
      ...this.#messages.slice(index + 1),
    ];
    this.#scheduleMessagesPublish();
  };

  snapshot = <T>(value: T): T => structuredClone(value);

  '~registerMessagesCallback' = (
    onChange: () => void,
    throttleWaitMs?: number,
  ): (() => void) => {
    // Configure the throttle window on the state itself, so the published
    // snapshot and the change notification are throttled together (see
    // `#publishMessages`). Throttling only the notification would leave
    // `getSnapshot` returning a fresh array on every chunk, which makes
    // `useSyncExternalStore` re-render past the throttle whenever the component
    // re-renders for any reason, and can exceed React's nested update limit
    // during fast streaming.
    if (throttleWaitMs !== this.#throttleWaitMs) {
      this.#throttleWaitMs = throttleWaitMs;
      this.#throttledPublishMessages = throttle(
        () => this.#publishMessages(),
        throttleWaitMs,
      );
    }

    this.#messagesCallbacks.add(onChange);
    return () => {
      this.#messagesCallbacks.delete(onChange);
    };
  };

  '~registerStatusCallback' = (onChange: () => void): (() => void) => {
    this.#statusCallbacks.add(onChange);
    return () => {
      this.#statusCallbacks.delete(onChange);
    };
  };

  '~registerErrorCallback' = (onChange: () => void): (() => void) => {
    this.#errorCallbacks.add(onChange);
    return () => {
      this.#errorCallbacks.delete(onChange);
    };
  };

  #scheduleMessagesPublish = () => {
    this.#throttledPublishMessages();
  };

  // Swap the published snapshot to the current messages and notify subscribers.
  // Doing both together keeps `getSnapshot` consistent with the notifications.
  #publishMessages = () => {
    this.#messagesSnapshot = this.#messages;
    this.#messagesCallbacks.forEach(callback => callback());
  };

  #callStatusCallbacks = () => {
    this.#statusCallbacks.forEach(callback => callback());
  };

  #callErrorCallbacks = () => {
    this.#errorCallbacks.forEach(callback => callback());
  };
}

export class Chat<
  UI_MESSAGE extends UIMessage,
> extends AbstractChat<UI_MESSAGE> {
  #state: ReactChatState<UI_MESSAGE>;

  constructor({ messages, ...init }: ChatInit<UI_MESSAGE>) {
    const state = new ReactChatState(messages);
    super({ ...init, state });
    this.#state = state;
  }

  /**
   * The throttled messages reference that React subscribes to via
   * `useSyncExternalStore`. Unlike `messages`, this reference only changes when
   * a throttled update is published, so it must be used as the store snapshot.
   */
  get messagesSnapshot(): UI_MESSAGE[] {
    return this.#state.messagesSnapshot;
  }

  '~registerMessagesCallback' = (
    onChange: () => void,
    throttleWaitMs?: number,
  ): (() => void) =>
    this.#state['~registerMessagesCallback'](onChange, throttleWaitMs);

  '~registerStatusCallback' = (onChange: () => void): (() => void) =>
    this.#state['~registerStatusCallback'](onChange);

  '~registerErrorCallback' = (onChange: () => void): (() => void) =>
    this.#state['~registerErrorCallback'](onChange);
}
