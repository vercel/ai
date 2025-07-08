import { UIMessage } from './ui-messages';
import { UIMessageStreamPart } from '../ui-message-stream';

export function createUiMessageIterable<UI_MESSAGE extends UIMessage>({
  stream,
}: {
  stream: ReadableStream<UIMessageStreamPart>;
}): AsyncIterableIterator<UI_MESSAGE> {
  return undefined as any;
}
