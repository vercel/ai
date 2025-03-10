import { ChildProcess } from 'node:child_process';
import { MCPClientError } from '../../../errors';
import {
  JSONRPCMessage,
  JSONRPCMessageSchema,
  MCPTransport,
  McpStdioServerConfig,
} from './types';
import { createChildProcess } from './utils';

export class StdioClientTransport implements MCPTransport {
  private process?: ChildProcess;
  private abortController: AbortController = new AbortController();
  private readBuffer: ReadBuffer = new ReadBuffer();
  private serverParams: McpStdioServerConfig;

  onClose?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (message: JSONRPCMessage) => void;

  constructor(server: McpStdioServerConfig) {
    this.serverParams = server;
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new MCPClientError({
        message: 'StdioClientTransport already started.',
      });
    }

    return new Promise((resolve, reject) => {
      this.process = createChildProcess(
        this.serverParams,
        this.abortController.signal,
      );

      this.process.on('error', error => {
        if (error.name === 'AbortError') {
          this.onClose?.();
          return;
        }

        reject(error);
        this.onError?.(error);
      });

      this.process.on('spawn', () => {
        resolve();
      });

      this.process.on('close', _code => {
        this.process = undefined;
        this.onClose?.();
      });

      this.process.stdin?.on('error', error => {
        this.onError?.(error);
      });

      this.process.stdout?.on('data', chunk => {
        this.readBuffer.append(chunk);
        this.processReadBuffer();
      });

      this.process.stdout?.on('error', error => {
        this.onError?.(error);
      });
    });
  }

  private processReadBuffer() {
    while (true) {
      try {
        const message = this.readBuffer.readMessage();
        if (message === null) {
          break;
        }

        this.onMessage?.(message);
      } catch (error) {
        this.onError?.(error as Error);
      }
    }
  }

  async close(): Promise<void> {
    this.abortController.abort();
    this.process = undefined;
    this.readBuffer.clear();
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise(resolve => {
      if (!this.process?.stdin) {
        throw new MCPClientError({
          message: 'StdioClientTransport not connected',
        });
      }

      const json = serializeMessage(message);
      if (this.process.stdin.write(json)) {
        resolve();
      } else {
        this.process.stdin.once('drain', resolve);
      }
    });
  }
}

class ReadBuffer {
  private buffer?: Buffer;

  append(chunk: Buffer): void {
    this.buffer = this.buffer ? Buffer.concat([this.buffer, chunk]) : chunk;
  }

  readMessage(): JSONRPCMessage | null {
    if (!this.buffer) return null;

    const index = this.buffer.indexOf('\n');
    if (index === -1) {
      return null;
    }

    const line = this.buffer.toString('utf8', 0, index);
    this.buffer = this.buffer.subarray(index + 1);
    return deserializeMessage(line);
  }

  clear(): void {
    this.buffer = undefined;
  }
}

function serializeMessage(message: JSONRPCMessage): string {
  return JSON.stringify(message) + '\n';
}

export function deserializeMessage(line: string): JSONRPCMessage {
  return JSONRPCMessageSchema.parse(JSON.parse(line));
}
