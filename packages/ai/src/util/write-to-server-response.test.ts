import { EventEmitter } from 'node:events';
import { ServerResponse } from 'node:http';
import { describe, it, expect } from 'vitest';
import { writeToServerResponse } from './write-to-server-response';

describe('writeToServerResponse', () => {
  it('should write data to ServerResponse', async () => {
    const mockResponse = createSimpleMockResponse();

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk1'));
        controller.enqueue(new TextEncoder().encode('chunk2'));
        controller.close();
      },
    });

    writeToServerResponse({
      response: mockResponse,
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'text/plain' },
      stream,
    });

    await mockResponse.waitForEnd();

    expect(mockResponse.statusCode).toBe(200);
    expect(mockResponse.statusMessage).toBe('OK');
    expect(mockResponse.writtenChunks).toHaveLength(2);
    expect(mockResponse.ended).toBe(true);
  });

  it('should respect backpressure and wait for drain event', async () => {
    const mockResponse = createBackpressureMockResponse();
    let drainEventCount = 0;
    let readyToEnqueue: ((value: unknown) => void) | null = null;

    // Track drain events
    mockResponse.on('drain', () => {
      drainEventCount++;
    });

    // Create stream that provides chunks on-demand (async)
    const stream = new ReadableStream({
      start(controller) {
        // First chunk available immediately
        controller.enqueue(new TextEncoder().encode('chunk1'));
        // Set up callback for additional chunks
        readyToEnqueue = value => {
          if (value === null) {
            controller.close();
          } else {
            controller.enqueue(value as Uint8Array);
          }
        };
      },
    });

    writeToServerResponse({
      response: mockResponse,
      status: 200,
      stream,
    });

    // Wait for first chunk to be written
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(mockResponse.writeCallCount).toBe(1);

    // Enqueue second chunk - it should trigger write which returns false (backpressure)
    readyToEnqueue!(new TextEncoder().encode('chunk2'));
    await new Promise(resolve => setTimeout(resolve, 5));

    // Second chunk write should have been called but returned false
    expect(mockResponse.writeCallCount).toBe(2);
    expect(mockResponse.writtenChunks.length).toBe(2);

    // Enqueue third chunk - it should NOT trigger write yet (still waiting for drain from chunk 2)
    readyToEnqueue!(new TextEncoder().encode('chunk3'));
    await new Promise(resolve => setTimeout(resolve, 5));

    // Third chunk shouldn't be written yet (waiting for drain)
    expect(mockResponse.writeCallCount).toBe(2);

    // Simulate drain to allow third write
    mockResponse.simulateDrain();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(mockResponse.writeCallCount).toBe(3);

    // Close the stream
    readyToEnqueue!(null);
    await mockResponse.waitForEnd();

    // Verify that drain was called (indicating backpressure was respected)
    expect(drainEventCount).toBeGreaterThanOrEqual(1);
    // Verify all chunks were eventually written
    expect(mockResponse.writtenChunks).toHaveLength(3);
  });
});

class SimpleMockResponse extends EventEmitter {
  writtenChunks: any[] = [];
  statusCode = 0;
  statusMessage = '';
  ended = false;

  write(chunk: any): boolean {
    this.writtenChunks.push(chunk);
    return true;
  }

  end(): void {
    this.ended = true;
  }

  writeHead(
    statusCode: number,
    statusMessage?: string,
    headers?: Record<string, string | number | string[]>,
  ): void {
    this.statusCode = statusCode;
    this.statusMessage = statusMessage || '';
  }

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

class BackpressureMockResponse extends EventEmitter {
  writtenChunks: any[] = [];
  writeCallCount = 0;
  statusCode = 0;
  statusMessage = '';
  ended = false;
  private shouldApplyBackpressure = false;

  write(chunk: any): boolean {
    this.writtenChunks.push(chunk);
    this.writeCallCount++;

    // First write succeeds, subsequent writes signal backpressure
    if (this.writeCallCount === 1) {
      this.shouldApplyBackpressure = true;
      return true; // First write is okay
    }

    // If we're in backpressure mode, return false
    if (this.shouldApplyBackpressure) {
      return false;
    }

    // After drain, this write succeeds, but next will need drain again
    this.shouldApplyBackpressure = true;
    return true;
  }

  simulateDrain(): void {
    this.shouldApplyBackpressure = false;
    this.emit('drain');
  }

  end(): void {
    this.ended = true;
  }

  writeHead(
    statusCode: number,
    statusMessage?: string,
    headers?: Record<string, string | number | string[]>,
  ): void {
    this.statusCode = statusCode;
    this.statusMessage = statusMessage || '';
  }

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

function createSimpleMockResponse(): ServerResponse & SimpleMockResponse {
  return new SimpleMockResponse() as ServerResponse & SimpleMockResponse;
}

function createBackpressureMockResponse(): ServerResponse &
  BackpressureMockResponse {
  return new BackpressureMockResponse() as ServerResponse &
    BackpressureMockResponse;
}
