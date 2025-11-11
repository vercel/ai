import { EventEmitter } from 'node:events';
import { ServerResponse } from 'node:http';

class MockServerResponse extends EventEmitter {
  writtenChunks: any[] = [];
  headers = {};
  statusCode = 0;
  statusMessage = '';
  ended = false;

  write(chunk: any): boolean {
    this.writtenChunks.push(chunk);
    // Return true to indicate the buffer is not full (no backpressure by default in tests)
    return true;
  }

  end(): void {
    // You might want to mark the response as ended to simulate the real behavior
    this.ended = true;
  }

  writeHead(
    statusCode: number,
    statusMessage: string,
    headers: Record<string, string>,
  ): void {
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.headers = headers;
  }

  get body() {
    // Combine all written chunks into a single string
    return this.writtenChunks.join('');
  }

  /**
   * Get the decoded chunks as strings.
   */
  getDecodedChunks() {
    const decoder = new TextDecoder();
    return this.writtenChunks.map(chunk => decoder.decode(chunk));
  }

  /**
   * Wait for the stream to finish writing to the mock response.
   */
  async waitForEnd() {
    await new Promise(resolve => {
      const checkIfEnded = () => {
        if (this.ended) {
          resolve(undefined);
        } else {
          setImmediate(checkIfEnded);
        }
      };
      checkIfEnded();
    });
  }
}

export function createMockServerResponse(): ServerResponse &
  MockServerResponse {
  return new MockServerResponse() as ServerResponse & MockServerResponse;
}
