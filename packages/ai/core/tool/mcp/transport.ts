import { EventSource } from 'eventsource';
import { ChildProcess, spawn } from 'node:child_process';
import process from 'node:process';
import {
  JSONRPCMessage,
  JSONRPCMessageSchema,
  Transport,
  TransportConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from './types';
import { AISDKError } from '@ai-sdk/provider';

export function createMcpTransport(config: TransportConfig): Transport {
  return config.type === 'stdio'
    ? new StdioClientTransport(config)
    : new SSEClientTransport(config);
}

export class StdioClientTransport implements Transport {
  private process?: ChildProcess;
  private abortController: AbortController = new AbortController();
  private readBuffer: ReadBuffer = new ReadBuffer();
  private serverParams: McpStdioServerConfig;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(server: McpStdioServerConfig) {
    this.serverParams = server;
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new AISDKError({
        name: 'McpTransportError',
        message: 'StdioClientTransport already started.',
      });
    }

    return new Promise((resolve, reject) => {
      this.process = spawn(
        this.serverParams.command,
        this.serverParams.args ?? [],
        {
          env: this.serverParams.env ?? getDefaultEnvironment(),
          stdio: ['pipe', 'pipe', this.serverParams.stderr ?? 'inherit'],
          shell: false,
          signal: this.abortController.signal,
          windowsHide: process.platform === 'win32' && isElectron(),
          cwd: this.serverParams.cwd,
        },
      );

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
        throw new AISDKError({
          name: 'TransportError',
          message: 'Not connected',
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

class SSEClientTransport implements Transport {
  private eventSource?: EventSource;
  private endpoint?: URL;
  private abortController?: AbortController;
  private url: URL;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor({ url }: McpSSEServerConfig) {
    this.url = new URL(url);
  }

  private _start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.eventSource = new EventSource(this.url.href);
      this.abortController = new AbortController();

      this.eventSource.onerror = event => {
        const error = new AISDKError({
          name: 'McpTransportError',
          message: `SSEClientTransport error (Code: ${event.code}): ${event.message}`,
          cause: event,
        });
        reject(error);
        this.onerror?.(error);
      };

      this.eventSource.onopen = () => {
        // The connection is open, but we need to wait for the endpoint to be received.
      };

      this.eventSource.addEventListener('endpoint', (event: Event) => {
        const messageEvent = event as MessageEvent;

        try {
          this.endpoint = new URL(messageEvent.data, this.url);
          if (this.endpoint.origin !== this.url.origin) {
            throw new AISDKError({
              name: 'McpTransportError',
              message: `Endpoint origin does not match connection origin: ${this.endpoint.origin}`,
            });
          }
        } catch (error) {
          reject(error);
          this.onerror?.(error as Error);
          void this.close();
          return;
        }

        resolve();
      });

      this.eventSource.onmessage = (event: Event) => {
        const messageEvent = event as MessageEvent;
        let message: JSONRPCMessage;
        try {
          message = JSONRPCMessageSchema.parse(JSON.parse(messageEvent.data));
        } catch (error) {
          this.onerror?.(error as Error);
          return;
        }

        this.onmessage?.(message);
      };
    });
  }

  async start(): Promise<void> {
    if (this.eventSource) {
      throw new AISDKError({
        name: 'McpTransportError',
        message: 'SSEClientTransport already started.',
      });
    }

    return this._start();
  }

  async close(): Promise<void> {
    this.abortController?.abort();
    this.eventSource?.close();
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.endpoint) {
      throw new AISDKError({
        name: 'McpTransportError',
        message: 'Not connected',
      });
    }

    try {
      const headers = new Headers();
      headers.set('content-type', 'application/json');
      const init = {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: this.abortController?.signal,
      };

      const response = await fetch(this.endpoint, init);
      if (!response.ok) {
        const text = await response.text().catch(() => null);
        throw new AISDKError({
          name: 'McpTransportError',
          message: `Error POSTing to endpoint (HTTP ${response.status}): ${text}`,
        });
      }
    } catch (error) {
      this.onerror?.(error as Error);
      throw error;
    }
  }
}

class ReadBuffer {
  private buffer?: Buffer;

  append(chunk: Buffer): void {
    // @ts-expect-error: need to fix - "type 'Buffer' is not assignable to type 'Uint8Array<ArrayBufferLike>'"
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

const DEFAULT_INHERITED_ENV_VARS =
  process.platform === 'win32'
    ? [
        'APPDATA',
        'HOMEDRIVE',
        'HOMEPATH',
        'LOCALAPPDATA',
        'PATH',
        'PROCESSOR_ARCHITECTURE',
        'SYSTEMDRIVE',
        'SYSTEMROOT',
        'TEMP',
        'USERNAME',
        'USERPROFILE',
      ]
    : ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER'];

function getDefaultEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of DEFAULT_INHERITED_ENV_VARS) {
    const value = process.env[key];
    if (value === undefined) {
      continue;
    }

    if (value.startsWith('()')) {
      continue;
    }

    env[key] = value;
  }

  return env;
}

function isElectron() {
  return 'type' in process;
}
