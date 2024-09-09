import { ServerResponse } from 'node:http';

/**
 * Writes the content of a stream to a server response.
 */
export function writeToServerResponse({
  response,
  status,
  statusText,
  headers,
  stream,
}: {
  response: ServerResponse;
  status?: number;
  statusText?: string;
  headers?: Record<string, string | number | string[]>;
  stream: ReadableStream<Uint8Array>;
}): void {
  response.writeHead(status ?? 200, statusText, headers);

  const reader = stream.getReader();
  const read = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        response.write(value);
      }
    } catch (error) {
      throw error;
    } finally {
      response.end();
    }
  };

  read();
}
