import { ChildProcess, spawn } from 'node:child_process';
import process from 'node:process';
import { MCPClientError } from '../../../errors';
import {
  JSONRPCMessage,
  JSONRPCMessageSchema,
  MCPTransport,
  TransportConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from './types';

export function createMcpTransport(config: TransportConfig): MCPTransport {
  return config.type === 'stdio'
    ? new StdioClientTransport(config)
    : new SSEClientTransport(config);
}

class StdioClientTransport implements MCPTransport {
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
      throw new MCPClientError({
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

class SSEClientTransport implements MCPTransport {
  private endpoint?: URL;
  private abortController?: AbortController;
  private url: URL;
  private connected = false;
  private sseConnection?: {
    close: () => void;
  };

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor({ url }: McpSSEServerConfig) {
    this.url = new URL(url);
  }

  async start(): Promise<void> {
    console.log('>>>>>>SSEClientTransport start', this.url);
    return new Promise<void>((resolve, reject) => {
      if (this.connected) {
        return resolve();
      }

      this.abortController = new AbortController();

      const establishConnection = async () => {
        try {
          const response = await fetch(this.url.href, {
            headers: {
              Accept: 'text/event-stream',
            },
            signal: this.abortController?.signal,
          });

          if (!response.ok || !response.body) {
            const error = new MCPClientError({
              message: `SSE connection failed: ${response.status} ${response.statusText}`,
            });
            this.onerror?.(error);
            return reject(error);
          }

          const reader = response.body.getReader();
          const textDecoder = new TextDecoder();

          let buffer = '';

          const processEvents = async () => {
            try {
              const { done, value } = await reader.read();

              if (done) {
                if (this.connected) {
                  const error = new MCPClientError({
                    message: 'SSE connection closed unexpectedly',
                  });
                  this.onerror?.(error);
                }
                return;
              }

              buffer += textDecoder.decode(value, { stream: true });
              const events = buffer.split('\n\n');
              buffer = events.pop() || '';

              for (const eventStr of events) {
                const eventLines = eventStr.split('\n');
                let event = '';
                let data = '';

                for (const line of eventLines) {
                  if (line.startsWith('event:')) {
                    event = line.substring(6).trim();
                  } else if (line.startsWith('data:')) {
                    data += line.substring(5).trim();
                  }
                }

                if (event === 'endpoint') {
                  try {
                    this.endpoint = new URL(data, this.url);
                    if (this.endpoint.origin !== this.url.origin) {
                      throw new MCPClientError({
                        message: `Endpoint origin does not match connection origin: ${this.endpoint.origin}`,
                      });
                    }
                    this.connected = true;
                    resolve();
                  } catch (error) {
                    reject(error);
                    this.onerror?.(error as Error);
                    this.close();
                    return;
                  }
                } else if (event === 'message') {
                  let message: JSONRPCMessage;
                  try {
                    message = JSONRPCMessageSchema.parse(JSON.parse(data));
                    this.onmessage?.(message);
                  } catch (error) {
                    this.onerror?.(error as Error);
                  }
                }
              }

              await processEvents();
            } catch (error) {
              if (error instanceof Error && error.name === 'AbortError') {
                return;
              }
              const e =
                error instanceof Error ? error : new Error(String(error));
              this.onerror?.(e);
              reject(e);
            }
          };

          this.sseConnection = {
            close: () => {
              reader.cancel();
            },
          };

          processEvents();
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }
          this.onerror?.(error as Error);
          reject(error);
        }
      };

      establishConnection();
    });
  }

  async close(): Promise<void> {
    this.connected = false;
    this.sseConnection?.close();
    this.abortController?.abort();
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.endpoint) {
      throw new MCPClientError({
        message: 'SSEClientTransport not connected',
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
        throw new MCPClientError({
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
