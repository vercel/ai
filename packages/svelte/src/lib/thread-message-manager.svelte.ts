import type { Message } from "@ai-sdk/ui-utils";
import { SvelteMap } from "svelte/reactivity";
import { box, type Box } from "./utils.svelte.js";

export type ThreadMessageManagerInit = Readonly<{
  threadId?: string;
  initialMessages?: Message[];
}>;

export class ThreadMessageManager {
  readonly #options = $state<ThreadMessageManagerInit>()!;
  readonly #messageMap = new SvelteMap<string, Message[]>();
  #unaffiliatedMessages: Message[] = $state([]);

  /**
   * The current array of chat messages.
   */
  get messages() {
    if (this.threadId === undefined) {
      return this.#unaffiliatedMessages;
    }
    if (this.#unaffiliatedMessages.length > 0) {
      // Mutations in a getter? Feels illegal but isn't, technically.
      // Basically what we're saying is that if we go from an undefined threadId to a defined one,
      // we want to take ownership of the unaffiliated messages.
      this.#messageMap.set(this.threadId, this.#unaffiliatedMessages);
      this.#unaffiliatedMessages = [];
    }
    return this.#messageMap.get(this.threadId) ?? [];
  }
  set messages(value: Message[]) {
    if (this.threadId === undefined) {
      this.#unaffiliatedMessages = value;
      return;
    }
    this.#messageMap.set(this.threadId, value);
  }

  /**
   * This is forked state -- it will respect the value of `#options.threadId` if it's changed
   * but can be internally updated through the setter.
   */
  #threadId = $derived<Box<string | undefined>>(box(this.#options.threadId));
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

  constructor(options: ThreadMessageManagerInit = {}) {
    this.#options = options;
    this.messages = options.initialMessages ?? [];
  }
}
