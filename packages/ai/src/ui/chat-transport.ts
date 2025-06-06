import { UIMessageStreamPart } from '../ui-message-stream';
import { ChatRequestOptions } from './chat';
import { UIDataTypes, UIMessage } from './ui-messages';

export interface ChatTransport<
  MESSAGE_METADATA,
  DATA_TYPES extends UIDataTypes,
> {
  // TODO better name
  submitMessages: (
    options: {
      chatId: string;
      messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
      abortSignal: AbortSignal | undefined;
      requestType: 'generate' | 'resume'; // TODO have separate functions
    } & ChatRequestOptions,
  ) => Promise<ReadableStream<UIMessageStreamPart>>;
}
