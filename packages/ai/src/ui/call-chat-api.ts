import {
  IdGenerator,
  parseJsonEventStream,
  ParseResult,
  Schema,
} from '@ai-sdk/provider-utils';
import {
  UIMessageStreamPart,
  uiMessageStreamPartSchema,
} from '../ui-message-stream/ui-message-stream-parts';
import { consumeStream } from '../util/consume-stream';
import { processUIMessageStream } from './process-ui-message-stream';
import { transformTextToUiMessageStream } from './transform-text-to-ui-message-stream';
import { UIMessage } from './ui-messages';
import { UseChatOptions } from './use-chat';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export async function callChatApi<MESSAGE_METADATA>({
  api,
  body,
  streamProtocol = 'ui-message',
  credentials,
  headers,
  abortController,
  onUpdate,
  onFinish,
  onToolCall,
  generateId,
  fetch = getOriginalFetch(),
  lastMessage,
  requestType = 'generate',
  messageMetadataSchema,
}: {
  api: string;
  body: Record<string, any>;
  streamProtocol: 'ui-message' | 'text' | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortController: (() => AbortController | null) | undefined;
  onUpdate: (options: { message: UIMessage<MESSAGE_METADATA> }) => void;
  onFinish: UseChatOptions<MESSAGE_METADATA>['onFinish'];
  onToolCall: UseChatOptions<MESSAGE_METADATA>['onToolCall'];
  generateId: IdGenerator;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
  lastMessage: UIMessage<MESSAGE_METADATA> | undefined;
  requestType?: 'generate' | 'resume';
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;
}) {
  const response =
    requestType === 'resume'
      ? await fetch(`${api}?chatId=${body.id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: abortController?.()?.signal,
          credentials,
        })
      : await fetch(api, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          signal: abortController?.()?.signal,
          credentials,
        });

  if (!response.ok) {
    throw new Error(
      (await response.text()) ?? 'Failed to fetch the chat response.',
    );
  }

  if (!response.body) {
    throw new Error('The response body is empty.');
  }

  const uiMessageStream =
    streamProtocol === 'text'
      ? transformTextToUiMessageStream({
          stream: response.body,
        })
      : parseJsonEventStream({
          stream: response.body,
          schema: uiMessageStreamPartSchema,
        }).pipeThrough(
          new TransformStream<
            ParseResult<UIMessageStreamPart>,
            UIMessageStreamPart
          >({
            async transform(part, controller) {
              if (!part.success) {
                throw part.error;
              }
              controller.enqueue(part.value);
            },
          }),
        );

  await consumeStream({
    stream: processUIMessageStream({
      stream: uiMessageStream,
      onUpdate({ message }) {
        const copiedMessage = {
          // deep copy the message to ensure that deep changes (msg attachments) are updated
          // with SolidJS. SolidJS uses referential integration of sub-objects to detect changes.
          ...structuredClone(message),

          // add a revision id to ensure that the message is updated with SWR. SWR uses a
          // hashing approach by default to detect changes, but it only works for shallow
          // changes. This is why we need to add a revision id to ensure that the message
          // is updated with SWR (without it, the changes get stuck in SWR and are not
          // forwarded to rendering):
          revisionId: generateId(),
        } as UIMessage<MESSAGE_METADATA>;

        onUpdate({ message: copiedMessage });
      },
      lastMessage,
      onToolCall,
      onFinish,
      newMessageId: generateId(),
      messageMetadataSchema,
    }),
    onError: error => {
      throw error;
    },
  });
}
