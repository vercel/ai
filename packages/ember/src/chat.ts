import { trackedObject } from '@ember/reactive/collections';
import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type CreateUIMessage,
  type UIMessage,
} from 'ai';
import { linkToParent, splitArguments } from './link-to-parent';

export type { CreateUIMessage, UIMessage };

/**
 * A chat whose `messages`, `status`, and `error` are tracked,
 * so templates and getters that read them update on their own.
 *
 * Pass a parent (usually the component) as the first argument
 * to stop the request when the parent is destroyed:
 *
 *   chat = new Chat(this, { transport });
 */
export class Chat<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends AbstractChat<UI_MESSAGE> {
  constructor(init?: ChatInit<UI_MESSAGE>);
  constructor(parent: object, init: ChatInit<UI_MESSAGE>);
  constructor(
    parentOrInit?: object | ChatInit<UI_MESSAGE>,
    maybeInit?: ChatInit<UI_MESSAGE>,
  ) {
    const { parent, options } = splitArguments(
      arguments.length,
      parentOrInit,
      maybeInit,
    );
    const init = options ?? {};

    super(
      Object.assign({}, init, {
        state: new EmberChatState<UI_MESSAGE>(init.messages),
      }),
    );

    linkToParent(this, parent, () => {
      void this.dispose();
    });
  }
}

class EmberChatState<
  UI_MESSAGE extends UIMessage,
> implements ChatState<UI_MESSAGE> {
  /**
   * One tracked bag for the whole state.
   *
   * Each key is tracked on its own,
   * so a template that reads only `status` does not rerun for a new message.
   *
   * The arrays inside are never changed in place.
   * Each change stores a new array, and the new array is what dirties the key.
   */
  readonly #state: {
    messages: UI_MESSAGE[];
    status: ChatStatus;
    error: Error | undefined;
    queuedMessages: UI_MESSAGE[];
  };

  constructor(messages: UI_MESSAGE[] = []) {
    this.#state = trackedObject({
      messages: messages.slice(),
      status: 'ready' as ChatStatus,
      error: undefined as Error | undefined,
      queuedMessages: [] as UI_MESSAGE[],
    });
  }

  get messages(): UI_MESSAGE[] {
    return this.#state.messages;
  }

  set messages(messages: UI_MESSAGE[]) {
    this.#state.messages = messages.slice();
  }

  get status(): ChatStatus {
    return this.#state.status;
  }

  set status(status: ChatStatus) {
    this.#state.status = status;
  }

  get error(): Error | undefined {
    return this.#state.error;
  }

  set error(error: Error | undefined) {
    this.#state.error = error;
  }

  get experimental_queuedMessages(): UI_MESSAGE[] {
    return this.#state.queuedMessages;
  }

  set experimental_queuedMessages(queuedMessages: UI_MESSAGE[]) {
    this.#state.queuedMessages = queuedMessages;
  }

  pushMessage = (message: UI_MESSAGE) => {
    this.#state.messages = this.#state.messages.concat([
      this.snapshot(message),
    ]);
  };

  popMessage = () => {
    this.#state.messages = this.#state.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UI_MESSAGE) => {
    const messages = this.#state.messages.slice();
    messages[index] = this.snapshot(message);
    this.#state.messages = messages;
  };

  /**
   * The stream changes its message object in place.
   *
   * A stored message must be a new object with new parts,
   * because a template sees a change only when the value it read is a new value:
   *
   *   {{#each chat.messages key="id" as |message|}}
   *     {{#each message.parts key="@index" as |part|}}
   *
   * Without the copy, an updated message has the same identity
   * and the text in the page would not change while the stream runs.
   */
  snapshot = <T>(value: T): T => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('parts' in value) ||
      !Array.isArray(value.parts)
    ) {
      return value;
    }

    const message = value as unknown as UI_MESSAGE;
    const copy: UI_MESSAGE = Object.assign({}, message, {
      parts: message.parts.map(part => Object.assign({}, part)),
    });

    if ('metadata' in message) {
      copy.metadata = cloneMetadata(message.metadata);
    }

    return copy as unknown as T;
  };
}

/**
 * Metadata can arrive in more than one chunk,
 * so the stored message needs its own copy of plain arrays and objects.
 *
 * Class instances and functions stay as they are.
 */
function cloneMetadata<METADATA>(metadata: METADATA): METADATA {
  if (Array.isArray(metadata)) {
    return metadata.slice() as METADATA;
  }

  if (
    metadata != null &&
    typeof metadata === 'object' &&
    (Object.getPrototypeOf(metadata) === Object.prototype ||
      Object.getPrototypeOf(metadata) === null)
  ) {
    return Object.assign({}, metadata);
  }

  return metadata;
}
