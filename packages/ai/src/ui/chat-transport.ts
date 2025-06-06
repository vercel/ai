import { UIMessageStreamPart } from '../ui-message-stream';
import { UIDataTypes, UIMessage } from './ui-messages';

export interface ChatTransport<
  MESSAGE_METADATA,
  DATA_TYPES extends UIDataTypes,
> {
  // TODO better name
  submitMessages: (options: {
    chatId: string;
    messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
    abortController: AbortController;
    requestMetadata: unknown;
    requestType: 'generate' | 'resume'; // TODO have separate functions
  }) => Promise<ReadableStream<UIMessageStreamPart>>;
}
