import type { Message } from "@ai-sdk/ui-utils";
import { SvelteMap } from "svelte/reactivity";
import { box, type Box } from "./utils.svelte.js";

export type ThreadMessageManagerInit<T extends Message> = Readonly<{
  threadId?: string;
  initialMessages?: T[];
  store: MessageManagerStore;
}>;

export class MessageManagerStore {
  readonly messageMap = new SvelteMap<string, Message[]>();
  unaffiliatedMessages: Message[] = [];
}

export class ThreadMessageManager<T extends Message = Message> {
  readonly #init = $state<ThreadMessageManagerInit<T>>()!;

  /**
   * The current array of chat messages.
   */
  get messages() {
    if (this.threadId === undefined) {
      return this.#init.store.unaffiliatedMessages;
    }
    if (this.#init.store.unaffiliatedMessages.length > 0) {
      // Mutations in a getter? Feels illegal but isn't, technically.
      // Basically what we're saying is that if we go from an undefined threadId to a defined one,
      // we want to take ownership of the unaffiliated messages.
      if (!this.#init.store.messageMap.has(this.threadId)) {
        this.#init.store.messageMap.set(
          this.threadId,
          this.#init.store.unaffiliatedMessages,
        );
      }
      this.#init.store.unaffiliatedMessages = [];
    }
    return this.#init.store.messageMap.get(this.threadId) ?? [];
  }
  set messages(value: Message[]) {
    if (this.threadId === undefined) {
      this.#init.store.unaffiliatedMessages = value;
      return;
    }
    this.#init.store.messageMap.set(this.threadId, value);
  }

  /**
   * This is forked state -- it will respect the value of `#options.threadId` if it's changed
   * but can be internally updated through the setter.
   */
  #threadId = $derived<Box<string | undefined>>(box(this.#init.threadId));
  /**
   * The current thread ID.
   * If set to `undefined`, a new thread will be created.
   */
  get threadId(): string | undefined {
    return this.#threadId.value;
  }
  set threadId(value: string | undefined) {
    this.#threadId.value = value;
  }

  constructor(
    init: ThreadMessageManagerInit<T> = {
      store: new MessageManagerStore(),
    },
  ) {
    this.#init = init;
    this.messages = init.initialMessages ?? [];
  }
}
