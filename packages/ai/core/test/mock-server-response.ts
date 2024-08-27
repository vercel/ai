import { ServerResponse } from 'node:http';

class MockServerResponse {
  writtenChunks: any[] = [];
  headers = {};
  statusCode = 0;
  ended = false;

  write(chunk: any): void {
    this.writtenChunks.push(chunk);
  }

  end(): void {
    // You might want to mark the response as ended to simulate the real behavior
    this.ended = true;
  }

  writeHead(statusCode: number, headers: Record<string, string>): void {
    this.statusCode = statusCode;
    this.headers = headers;
  }

  get body() {
    // Combine all written chunks into a single string
    return this.writtenChunks.join('');
  }
}

export function createMockServerResponse(): ServerResponse &
  MockServerResponse {
  return new MockServerResponse() as ServerResponse & MockServerResponse;
}
