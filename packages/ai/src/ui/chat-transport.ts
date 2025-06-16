import { UIMessageStreamPart } from '../ui-message-stream';
import { ChatRequestOptions } from './chat';
import { UIMessage } from './ui-messages';

export interface ChatTransport<UI_MESSAGE extends UIMessage> {
  // TODO better name
  submitMessages: (
    options: {
      chatId: string;
      messages: UI_MESSAGE[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ) => Promise<ReadableStream<UIMessageStreamPart>>;

  reconnectToStream: (
    options: {
      chatId: string;
    } & ChatRequestOptions,
  ) => Promise<ReadableStream<UIMessageStreamPart> | null>;
}
