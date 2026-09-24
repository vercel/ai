import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type CreateUIMessage,
  type UIMessage,
} from 'ai';
import { onMount } from 'svelte';
export type { CreateUIMessage, UIMessage };

export type ChatOptions<UI_MESSAGE extends UIMessage = UIMessage> = Readonly<
  ChatInit<UI_MESSAGE> & {
    /**
     * Whether to resume an ongoing chat generation stream when the component mounts.
     */
    resume?: boolean;
  }
>;

export class Chat<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends AbstractChat<UI_MESSAGE> {
  constructor({ resume = false, ...init }: ChatOptions<UI_MESSAGE>) {
    super({
      ...init,
      state: new SvelteChatState(init.messages),
    });

    if (resume) {
      onMount(() => {
        void this.resumeStream();
      });
    }
  }
}

class SvelteChatState<
  UI_MESSAGE extends UIMessage,
> implements ChatState<UI_MESSAGE> {
  messages: UI_MESSAGE[];
  status = $state<ChatStatus>('ready');
  error = $state<Error | undefined>(undefined);

  constructor(messages: UI_MESSAGE[] = []) {
    this.messages = $state(messages);
  }

  setMessages = (messages: UI_MESSAGE[]) => {
    this.messages = messages;
  };

  pushMessage = (message: UI_MESSAGE) => {
    this.messages.push(message);
  };

  popMessage = () => {
    this.messages.pop();
  };

  replaceMessage = (index: number, message: UI_MESSAGE) => {
    this.messages[index] = message;
  };

  snapshot = <T>(thing: T): T => $state.snapshot(thing) as T;
}
