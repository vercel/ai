import { UIMessageStreamPart } from '../ui-message-stream';
import { ChatRequestOptions } from './chat';
import { UIMessage } from './ui-messages';

export interface ChatTransport<UI_MESSAGE extends UIMessage> {
  sendMessages: (
    options: {
      chatId: string;
      messages: UI_MESSAGE[];
      abortSignal: AbortSignal | undefined;
    } & {
      trigger:
        | 'submit-user-message'
        | 'submit-tool-result'
        | 'regenerate-assistant-message';
      messageId: string | undefined;
    } & ChatRequestOptions,
  ) => Promise<ReadableStream<UIMessageStreamPart>>;

  reconnectToStream: (
    options: {
      chatId: string;
    } & ChatRequestOptions,
  ) => Promise<ReadableStream<UIMessageStreamPart> | null>;
}
