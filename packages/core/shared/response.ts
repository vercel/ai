import { ResponseError } from './error';

export function handleResponseError(
  response: Response,
  message?: string,
  onError?: (response: Response) => unknown,
): asserts response is Response & { body: ReadableStream; ok: true } {
  if (!response.ok) {
    if (onError) {
      onError(response);
    }

    throw new ResponseError(
      response,
      message || 'Failed to fetch the chat response.',
    );
  }

  if (!response.body) {
    throw new Error('The response body is empty.');
  }
}
