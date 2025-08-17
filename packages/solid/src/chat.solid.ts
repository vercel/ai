import { AbstractChat, ChatInit, ChatState, ChatStatus, UIMessage } from "ai";
import { Accessor, createSignal, Signal } from "solid-js";
import { createStore, produce, reconcile, SetStoreFunction } from "solid-js/store";




export class SolidChatState<UI_MESSAGE extends UIMessage> implements ChatState<UI_MESSAGE> {
  private messagesSignal: Signal<UI_MESSAGE[]>;
  private statusSignal: Signal<ChatStatus>;
  private errorSignal: Signal<Error | undefined>;

  constructor(initialMessages: UI_MESSAGE[] = []) {
    this.messagesSignal = createSignal(initialMessages);
    this.statusSignal = createSignal<ChatStatus>('ready');
    this.errorSignal = createSignal<Error | undefined>(undefined);
  }

  get status(): ChatStatus {
    return this.statusSignal[0]();
  }

  set status(status: ChatStatus) {
    const [, setStatus] = this.statusSignal;
    setStatus(status);
  }

  get messages(): UI_MESSAGE[] {
    const [messages] = this.messagesSignal;
    return messages();
  }

  set messages(messages: UI_MESSAGE[]) {
    const [, setMessages] = this.messagesSignal;
    setMessages([...messages]);
  }

  get error(): Error | undefined {
    return this.errorSignal[0]();
  }

  set error(error: Error | undefined) {
    this.errorSignal[1](() => error);
  }

  get statusAccessor(): Accessor<ChatStatus> {
    return this.statusSignal[0];
  }

  get errorAccessor(): Accessor<Error | undefined> {
    return this.errorSignal[0];
  }

  get messagesAccessor(): Accessor<UI_MESSAGE[]> {
    return this.messagesSignal[0];
  }

  pushMessage = (message: UI_MESSAGE) => {
    const [, setMessages] = this.messagesSignal;
    setMessages((m) => [...m.map(m => ({...m, parts: [...m.parts]})), message]);
  }
  popMessage = () => {
    const [, setMessages] = this.messagesSignal;
    setMessages((m) => [...m.map(m => ({...m, parts: [...m.parts]}))].slice(0, -1));
  }
  replaceMessage = (index: number, message: UI_MESSAGE) => {
    const [, setMessages] = this.messagesSignal;
    setMessages((m) => [...m.map(m => ({...m, parts: [...m.parts]}))].map((m, i) => i === index ? message : m));
  }
  snapshot = <T>(thing: T): T => structuredClone(thing);
}

export class Chat<
  UI_MESSAGE extends UIMessage,
> extends AbstractChat<UI_MESSAGE> {
  #state: SolidChatState<UI_MESSAGE>;
  constructor({ messages, ...init }: ChatInit<UI_MESSAGE>) {
    const state = new SolidChatState<UI_MESSAGE>(messages);
    super({ ...init, state });
    this.#state = state;
  }

  get statusAccessor(): Accessor<ChatStatus> {
    return this.#state.statusAccessor;
  }

  get messages(): UI_MESSAGE[] {
    return this.#state.messages;
  }

  set messages(messages: UI_MESSAGE[]) {
    this.#state.messages = messages;
  }

  get errorAccessor(): Accessor<Error | undefined> {
    return this.#state.errorAccessor;
  }

  get messagesAccessor(): Accessor<UI_MESSAGE[]> {
    return this.#state.messagesAccessor;
  }
  
}
