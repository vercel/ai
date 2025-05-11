import { JSONValue } from '@ai-sdk/provider';
import { parseJsonEventStream, ParseResult } from '@ai-sdk/provider-utils';
import {
  DataStreamPart,
  dataStreamPartSchema,
} from '../data-stream/data-stream-parts';
import { consumeStream } from '../util/consume-stream';
import { processChatResponse } from './process-chat-response';
import { processTextStream } from './process-text-stream';
import { UIMessage } from './ui-messages';

// use function to allow for mocking in tests:
const getOriginalFetch = () => fetch;

export async function callCompletionApi({
  api,
  prompt,
  credentials,
  headers,
  body,
  streamProtocol = 'data',
  setCompletion,
  setLoading,
  setError,
  setAbortController,
  onResponse,
  onFinish,
  onError,
  onData,
  fetch = getOriginalFetch(),
}: {
  api: string;
  prompt: string;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  body: Record<string, any>;
  streamProtocol: 'data' | 'text' | undefined;
  setCompletion: (completion: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | undefined) => void;
  setAbortController: (abortController: AbortController | null) => void;
  onResponse: ((response: Response) => void | Promise<void>) | undefined;
  onFinish: ((prompt: string, completion: string) => void) | undefined;
  onError: ((error: Error) => void) | undefined;
  onData: ((data: JSONValue[]) => void) | undefined;
  fetch: ReturnType<typeof getOriginalFetch> | undefined;
}) {
  try {
    setLoading(true);
    setError(undefined);

    const abortController = new AbortController();
    setAbortController(abortController);

    // Empty the completion immediately.
    setCompletion('');

    const response = await fetch(api, {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        ...body,
      }),
      credentials,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: abortController.signal,
    }).catch(err => {
      throw err;
    });

    if (onResponse) {
      try {
        await onResponse(response);
      } catch (err) {
        throw err;
      }
    }

    if (!response.ok) {
      throw new Error(
        (await response.text()) ?? 'Failed to fetch the chat response.',
      );
    }

    if (!response.body) {
      throw new Error('The response body is empty.');
    }

    let result = '';

    switch (streamProtocol) {
      case 'text': {
        await processTextStream({
          stream: response.body,
          onTextPart: chunk => {
            result += chunk;
            setCompletion(result);
          },
        });
        break;
      }
      case 'data': {
        await consumeStream({
          stream: parseJsonEventStream({
            stream: response.body,
            schema: dataStreamPartSchema,
          }).pipeThrough(
            new TransformStream<ParseResult<DataStreamPart>, DataStreamPart>({
              async transform(part, controller) {
                if (!part.success) {
                  throw part.error;
                }

                const { type, value } = part.value;

                if (type === 'text') {
                  result += value;
                  setCompletion(result);
                } else if (type === 'error') {
                  throw new Error(value);
                }
              },
            }),
          ),
        });
        break;
      }
      default: {
        const exhaustiveCheck: never = streamProtocol;
        throw new Error(`Unknown stream protocol: ${exhaustiveCheck}`);
      }
    }

    if (onFinish) {
      onFinish(prompt, result);
    }

    setAbortController(null);
    return result;
  } catch (err) {
    // Ignore abort errors as they are expected.
    if ((err as any).name === 'AbortError') {
      setAbortController(null);
      return null;
    }

    if (err instanceof Error) {
      if (onError) {
        onError(err);
      }
    }

    setError(err as Error);
  } finally {
    setLoading(false);
  }
}
