import {
  AbstractChat,
  ChatInit,
  ChatState,
  ChatStatus,
  InferUIDataParts,
  UIDataPartSchemas,
  UIDataTypes,
  UIMessage,
} from 'ai';
import { throttle } from './throttle';

type SubscriptionRegistrars = {
  '~registerMessagesCallback': (onChange: () => void) => () => void;
  '~registerStatusCallback': (onChange: () => void) => () => void;
  '~registerErrorCallback': (onChange: () => void) => () => void;
};

class ReactChatState<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes>
  implements ChatState<MESSAGE_METADATA, DATA_TYPES>
{
  #messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
  #status: ChatStatus = 'ready';
  #error: Error | undefined = undefined;

  #messagesCallbacks = new Set<() => void>();
  #statusCallbacks = new Set<() => void>();
  #errorCallbacks = new Set<() => void>();

  constructor(initialMessages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[] = []) {
    this.#messages = initialMessages;
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

  get messages(): UIMessage<MESSAGE_METADATA, DATA_TYPES>[] {
    return this.#messages;
  }

  set messages(newMessages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
    this.#messages = [...newMessages];
    this.#callMessagesCallbacks();
  }

  pushMessage = (message: UIMessage<MESSAGE_METADATA, DATA_TYPES>) => {
    this.#messages = this.#messages.concat(message);
    this.#callMessagesCallbacks();
  };

  popMessage = () => {
    this.#messages = this.#messages.slice(0, -1);
    this.#callMessagesCallbacks();
  };

  replaceMessage = (
    index: number,
    message: UIMessage<MESSAGE_METADATA, DATA_TYPES>,
  ) => {
    this.#messages = [
      ...this.#messages.slice(0, index),
      message,
      ...this.#messages.slice(index + 1),
    ];
    this.#callMessagesCallbacks();
  };

  snapshot = <T>(value: T): T => structuredClone(value);

  '~registerMessagesCallback' = (
    onChange: () => void,
    throttleWaitMs?: number,
  ): (() => void) => {
    const callback = throttleWaitMs
      ? throttle(onChange, throttleWaitMs)
      : onChange;
    this.#messagesCallbacks.add(callback);
    return () => {
      this.#messagesCallbacks.delete(callback);
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

  #callMessagesCallbacks = () => {
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
    MESSAGE_METADATA,
    UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
  >
  extends AbstractChat<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>
  implements SubscriptionRegistrars
{
  #state: ReactChatState<
    MESSAGE_METADATA,
    InferUIDataParts<UI_DATA_PART_SCHEMAS>
  >;

  constructor({
    messages,
    ...init
  }: ChatInit<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>) {
    const state = new ReactChatState(messages);
    super({ ...init, state });
    this.#state = state;
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