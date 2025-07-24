import { UIMessageChunk } from '../ui-message-stream';
import { ChatRequestOptions } from './chat';
import { UIMessage } from './ui-messages';

export interface ChatTransport<UI_MESSAGE extends UIMessage> {
  sendMessages: (
    options: {
      chatId: string;
      messages: UI_MESSAGE[];
      abortSignal: AbortSignal | undefined;
    } & {
      trigger: 'submit-message' | 'regenerate-message';
      messageId: string | undefined;
    } & ChatRequestOptions,
  ) => Promise<ReadableStream<UIMessageChunk>>;

  reconnectToStream: (
    options: {
      chatId: string;
    } & ChatRequestOptions,
  ) => Promise<ReadableStream<UIMessageChunk> | null>;
}
