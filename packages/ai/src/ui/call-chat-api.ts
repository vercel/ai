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
import { Job } from '../util/job';
import { processUIMessageStream } from './process-ui-message-stream';
import { transformTextToUiMessageStream } from './transform-text-to-ui-message-stream';
import { ReasoningUIPart, TextUIPart, UIMessage } from './ui-messages';
import { UseChatOptions } from './use-chat';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export async function fetchUIMessageStream({
  api,
  body,
  streamProtocol = 'ui-message',
  credentials,
  headers,
  abortController,
  fetch = getOriginalFetch(),
  requestType = 'generate',
}: {
  api: string;
  body: Record<string, any>;
  streamProtocol: 'ui-message' | 'text' | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  abortController: (() => AbortController | null) | undefined;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
  requestType?: 'generate' | 'resume';
}): Promise<ReadableStream<UIMessageStreamPart>> {
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

  return streamProtocol === 'text'
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
}

export async function consumeUIMessageStream<MESSAGE_METADATA>({
  stream,
  onUpdate,
  onFinish,
  onToolCall,
  onStart,
  generateId,
  lastMessage,
  messageMetadataSchema,
  acquireLock,
}: {
  stream: ReadableStream<UIMessageStreamPart>;
  onUpdate: (options: { message: UIMessage<MESSAGE_METADATA> }) => void;
  onFinish: UseChatOptions<MESSAGE_METADATA>['onFinish'];
  onStart?: () => void;
  onToolCall: UseChatOptions<MESSAGE_METADATA>['onToolCall'];
  generateId: IdGenerator;
  lastMessage: UIMessage<MESSAGE_METADATA> | undefined;
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;
  acquireLock?: () => {
    write: (job: Job) => Promise<void>;
    release: () => void;
    activeResponse: {
      message: UIMessage<MESSAGE_METADATA>;
      currentTextPart?: TextUIPart;
      setCurrentTextPart: (currentTextPart?: TextUIPart) => void;
      currentReasoningPart?: ReasoningUIPart;
      setCurrentReasoningPart: (currentReasoningPart?: ReasoningUIPart) => void;
      toolCalls?: Record<
        string,
        {
          textArgs: string;
          toolName: string;
        }
      >;
    };
  };
}) {
  await consumeStream({
    stream: processUIMessageStream({
      stream,
      onUpdate,
      lastMessage,
      onToolCall,
      onStart,
      onFinish,
      newMessageId: generateId(),
      messageMetadataSchema,
      acquireLock,
    }),
    onError: error => {
      throw error;
    },
  });
}

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
  const stream = await fetchUIMessageStream({
    api,
    body,
    streamProtocol,
    credentials,
    headers,
    abortController,
    fetch,
    requestType,
  });

  await consumeUIMessageStream({
    stream,
    onUpdate,
    onFinish,
    onToolCall,
    generateId,
    lastMessage,
    messageMetadataSchema,
  });
}
