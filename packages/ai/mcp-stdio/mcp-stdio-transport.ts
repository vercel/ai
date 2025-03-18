import type { ChildProcess, IOType } from 'node:child_process';
import { Stream } from 'node:stream';
import {
  JSONRPCMessage,
  JSONRPCMessageSchema,
} from '../core/tool/mcp/json-rpc-message';
import { MCPTransport } from '../core/tool/mcp/mcp-transport';
import { MCPClientError } from '../errors';
import { createChildProcess } from './create-child-process';

export interface StdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  stderr?: IOType | Stream | number;
  cwd?: string;
}

export class StdioMCPTransport implements MCPTransport {
  private process?: ChildProcess;
  private abortController: AbortController = new AbortController();
  private readBuffer: ReadBuffer = new ReadBuffer();
  private serverParams: StdioConfig;

  onclose?: () => void;
  onerror?: (error: unknown) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(server: StdioConfig) {
    this.serverParams = server;
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new MCPClientError({
        message: 'StdioMCPTransport already started.',
      });
    }

    return new Promise(async (resolve, reject) => {
      try {
        const process = await createChildProcess(
          this.serverParams,
          this.abortController.signal,
        );

        this.process = process;

        this.process.on('error', error => {
          if (error.name === 'AbortError') {
            this.onclose?.();
            return;
          }

          reject(error);
          this.onerror?.(error);
        });

        this.process.on('spawn', () => {
          resolve();
        });

        this.process.on('close', _code => {
          this.process = undefined;
          this.onclose?.();
        });

        this.process.stdin?.on('error', error => {
          this.onerror?.(error);
        });

        this.process.stdout?.on('data', chunk => {
          this.readBuffer.append(chunk);
          this.processReadBuffer();
        });

        this.process.stdout?.on('error', error => {
          this.onerror?.(error);
        });
      } catch (error) {
        reject(error);
        this.onerror?.(error);
      }
    });
  }

  private processReadBuffer() {
    while (true) {
      try {
        const message = this.readBuffer.readMessage();
        if (message === null) {
          break;
        }

        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(error as Error);
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
