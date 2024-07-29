import { readDataStream } from './read-data-stream';
import { JSONValue } from './types';
import { createChunkDecoder } from './index';

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

    const res = await fetch(api, {
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
        await onResponse(res);
      } catch (err) {
        throw err;
      }
    }

    if (!res.ok) {
      throw new Error(
        (await res.text()) || 'Failed to fetch the chat response.',
      );
    }

    if (!res.body) {
      throw new Error('The response body is empty.');
    }

    let result = '';
    const reader = res.body.getReader();

    switch (streamProtocol) {
      case 'text': {
        const decoder = createChunkDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          // Update the completion state with the new message tokens.
          result += decoder(value);
          setCompletion(result);

          // The request has been aborted, stop reading the stream.
          if (abortController === null) {
            reader.cancel();
            break;
          }
        }

        break;
      }

      case 'data': {
        for await (const { type, value } of readDataStream(reader, {
          isAborted: () => abortController === null,
        })) {
          switch (type) {
            case 'text': {
              result += value;
              setCompletion(result);
              break;
            }
            case 'data': {
              onData?.(value);
              break;
            }
          }
        }
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
