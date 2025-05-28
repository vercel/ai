import { UIMessageStreamPart } from '../ui-message-stream';
import { UIDataTypes, UIMessage } from './ui-messages';

export interface ChatTransport<
  MESSAGE_METADATA,
  DATA_TYPES extends UIDataTypes,
> {
  submitMessages: (options: {
    chatId: string;
    messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
    abortController: AbortController;
    body?: object;
    headers?: Record<string, string> | Headers;
    requestType: 'generate' | 'resume'; // TODO have separate functions
  }) => Promise<ReadableStream<UIMessageStreamPart>>;
}
