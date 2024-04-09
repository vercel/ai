import { readDataStream } from './read-data-stream';
import { JSONValue } from './types';

export async function callCompletionApi({
  api,
  prompt,
  credentials,
  headers,
  body,
  setCompletion,
  setLoading,
  setError,
  setAbortController,
  onResponse,
  onFinish,
  onError,
  onData,
}: {
  api: string;
  prompt: string;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  body: Record<string, any>;
  setCompletion: (completion: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | undefined) => void;
  setAbortController: (abortController: AbortController | null) => void;
  onResponse?: (response: Response) => void | Promise<void>;
  onFinish?: (prompt: string, completion: string) => void;
  onError?: (error: Error) => void;
  onData?: (data: JSONValue[]) => void;
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
