import {
  AbstractChat,
  ChatInit,
  ChatStatus,
  type CreateUIMessage,
  type UIMessage,
} from 'ai';
import { Chat } from './chat.solid';
import { Accessor, createEffect, createMemo } from 'solid-js';
import { useSyncSignalCallback } from './util/use-sync-store';

export type { CreateUIMessage, UIMessage };

export type UseChatHelpers<UI_MESSAGE extends UIMessage> = {
  /**
   * The id of the chat.
   */
  readonly id: string;

  /**
   * Update the `messages` state locally. This is useful when you want to
   * edit the messages on the client, and then trigger the `reload` method
   * manually to regenerate the AI response.
   */
  setMessages: (
    messages: UI_MESSAGE[] | ((messages: UI_MESSAGE[]) => UI_MESSAGE[]),
  ) => void;

  error: Accessor<Error | undefined>;
  status: Accessor<ChatStatus>;
  messages: Accessor<UI_MESSAGE[]>;
} & Pick<
  AbstractChat<UI_MESSAGE>,
  | 'sendMessage'
  | 'regenerate'
  | 'stop'
  | 'resumeStream'
  | 'addToolResult'
  | 'clearError'
>;

export type UseChatOptions<UI_MESSAGE extends UIMessage> = (
  | { chat: Chat<UI_MESSAGE> }
  | ChatInit<UI_MESSAGE>
) & {
  /**
Custom throttle wait in ms for the chat messages and data updates.
Default is undefined, which disables throttling.
   */
  experimental_throttle?: number;

  /**
   * Whether to resume an ongoing chat generation stream.
   */
  resume?: boolean;
};

export function useChat<UI_MESSAGE extends UIMessage = UIMessage>({
  experimental_throttle: throttleWaitMs,
  resume = false,
  ...options
}: UseChatOptions<UI_MESSAGE> = {}): UseChatHelpers<UI_MESSAGE> {
  let chatRef: Chat<UI_MESSAGE> = 'chat' in options ? options.chat : new Chat(options);

  const shouldRecreateChat =
    ('chat' in options && options.chat !== chatRef) ||
    ('id' in options && chatRef.id !== options.id);

  if (shouldRecreateChat) {
    chatRef = 'chat' in options ? options.chat : new Chat(options);
  }

  const setMessages = 
    (
      messagesParam: UI_MESSAGE[] | ((messages: UI_MESSAGE[]) => UI_MESSAGE[]),
    ) => {
      if (typeof messagesParam === 'function') {
        messagesParam = messagesParam(chatRef.messages);
      }
      chatRef.messages = messagesParam;
    };
  

  createEffect(() => {
    if (resume) {
      chatRef.resumeStream();
    }
  });


  const messages = useSyncSignalCallback('messages', chatRef.messages, chatRef['~registerMessagesCallback'], () => chatRef.messages);
  const status = useSyncSignalCallback('status', chatRef.status, chatRef['~registerStatusCallback'], () => chatRef.status);
  const error = useSyncSignalCallback('error', chatRef.error, chatRef['~registerErrorCallback'], () => chatRef.error);

  return {
    id: chatRef.id,
    messages: messages,
    setMessages,
    sendMessage: chatRef.sendMessage,
    regenerate: chatRef.regenerate,
    clearError: chatRef.clearError,
    stop: chatRef.stop,
    error: error,
    resumeStream: chatRef.resumeStream,
    status: status,
    addToolResult: chatRef.addToolResult,
  };
}
