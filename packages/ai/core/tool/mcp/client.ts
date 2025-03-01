import { z, ZodType } from 'zod';
import {
  CallToolRequest,
  CallToolResult,
  CallToolResultSchema,
  CompatibilityCallToolResult,
  CompatibilityCallToolResultSchema,
  Implementation,
  InitializeResultSchema,
  JSONRPCError,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
  LATEST_PROTOCOL_VERSION,
  ListToolsRequest,
  ListToolsResult,
  ListToolsResultSchema,
  Notification,
  Request,
  RequestOptions,
  ServerCapabilities,
  SUPPORTED_PROTOCOL_VERSIONS,
  TimeoutInfo,
  Transport,
} from './types';
import { AISDKError } from '@ai-sdk/provider';

/**
 * A lightweight MCP Client implementation,
 * primarily for tool conversion between MCP<>AI SDK.
 *
 * It is a custom implementation of the MCP Client (derived from Protocol) class.
 *
 * Not supported:
 * - Client options (e.g. sampling, roots) as they are not needed for tool conversion
 * - Accepting notifications
 */
export class SimpleMcpClient {
  private _transport: Transport | undefined;
  private _requestMessageId = 0;
  private _responseHandlers: Map<
    number,
    (response: JSONRPCResponse | Error) => void
  > = new Map();
  private connectionTimeoutMs: number;
  private requestTimeoutMs: number;
  private _timeoutInfo: Map<number, TimeoutInfo> = new Map();
  private _serverCapabilities?: ServerCapabilities;

  constructor(private _clientInfo: Implementation) {
    this.connectionTimeoutMs = _clientInfo.connectionTimeoutMs || 6000;
    this.requestTimeoutMs = _clientInfo.requestTimeoutMs || 3000;
  }

  async connect(transport: Transport): Promise<void> {
    try {
      await this._initTransport(transport);

      const result = await this.request(
        {
          method: 'initialize',
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: this._clientInfo,
          },
        },
        InitializeResultSchema,
        { timeout: this.connectionTimeoutMs },
      );

      if (result === undefined) {
        throw new AISDKError({
          name: 'McpClientError',
          message: 'Server sent invalid initialize result',
        });
      }

      if (!SUPPORTED_PROTOCOL_VERSIONS.includes(result.protocolVersion)) {
        throw new AISDKError({
          name: 'McpClientError',
          message: `Server's protocol version is not supported: ${result.protocolVersion}`,
        });
      }

      this._serverCapabilities = result.capabilities;

      await this.notification({
        method: 'notifications/initialized',
      });
    } catch (error) {
      void this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this._transport?.close();
    this._onclose();
  }

  async request<T extends ZodType<object>>(
    request: Request,
    resultSchema: T,
    options?: RequestOptions,
  ): Promise<z.infer<T>> {
    return new Promise((resolve, reject) => {
      if (!this._transport) {
        reject(new Error('Not connected'));
        return;
      }

      options?.signal?.throwIfAborted();

      const messageId = this._requestMessageId++;
      const jsonrpcRequest: JSONRPCRequest = {
        ...request,
        jsonrpc: '2.0',
        id: messageId,
      };

      const cancel = (reason: unknown) => {};

      this._responseHandlers.set(messageId, response => {
        if (options?.signal?.aborted) return;

        if (response instanceof Error) {
          return reject(response);
        }

        try {
          const result = resultSchema.parse(response.result);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      options?.signal?.addEventListener('abort', () => {
        cancel(options?.signal?.reason);
      });

      const timeout = options?.timeout ?? this.requestTimeoutMs;
      const timeoutHandler = () =>
        cancel(
          new AISDKError({
            name: 'McpClientTimeoutError',
            message: 'Request timed out',
          }),
        );

      this._setupTimeout(
        messageId,
        timeout,
        options?.maxTotalTimeout,
        timeoutHandler,
      );

      this._transport.send(jsonrpcRequest).catch(error => {
        this._cleanupTimeout(messageId);
        reject(error);
      });
    });
  }

  async listTools(
    params?: ListToolsRequest['params'],
    options?: RequestOptions,
  ): Promise<ListToolsResult> {
    if (!this._serverCapabilities?.tools) {
      throw new AISDKError({
        name: 'McpClientError',
        message: `Server does not support tools (required for tools/list)`,
      });
    }

    return this.request(
      { method: 'tools/list', params },
      ListToolsResultSchema,
      options,
    );
  }

  async callTool(
    params: CallToolRequest['params'],
    resultSchema:
      | typeof CallToolResultSchema
      | typeof CompatibilityCallToolResultSchema = CallToolResultSchema,
    options?: RequestOptions,
  ): Promise<CallToolResult | CompatibilityCallToolResult> {
    if (!this._serverCapabilities?.tools) {
      throw new AISDKError({
        name: 'McpClientError',
        message: `Server does not support tools (required for tools/call)`,
      });
    }

    return this.request(
      { method: 'tools/call', params },
      resultSchema,
      options,
    );
  }

  async notification(notification: Notification): Promise<void> {
    if (!this._transport) {
      throw new AISDKError({
        name: 'McpClientError',
        message: 'Not connected',
      });
    }

    const jsonrpcNotification: JSONRPCNotification = {
      ...notification,
      jsonrpc: '2.0',
    };

    await this._transport.send(jsonrpcNotification);
  }

  private _setupTimeout(
    messageId: number,
    timeout: number,
    maxTotalTimeout: number | undefined,
    onTimeout: () => void,
  ) {
    this._timeoutInfo.set(messageId, {
      timeoutId: setTimeout(onTimeout, timeout),
      startTime: Date.now(),
      timeout,
      maxTotalTimeout,
      onTimeout,
    });
  }

  private _cleanupTimeout(messageId: number) {
    const info = this._timeoutInfo.get(messageId);
    if (info) {
      clearTimeout(info.timeoutId);
      this._timeoutInfo.delete(messageId);
    }
  }

  private _onclose(): void {
    const responseHandlers = this._responseHandlers;
    this._responseHandlers = new Map();
    this._transport = undefined;

    const error = new AISDKError({
      name: 'McpClientConnectionClosedError',
      message: 'Connection closed',
    });

    for (const handler of responseHandlers.values()) {
      handler(error);
    }
  }

  private _onerror(error: Error): void {
    throw new AISDKError({
      name: 'McpClientError',
      message: error.message,
      cause: error,
    });
  }

  private _onresponse(response: JSONRPCResponse | JSONRPCError): void {
    const messageId = Number(response.id);
    const handler = this._responseHandlers.get(messageId);
    if (handler === undefined) {
      this._onerror(
        new Error(
          `Received a response for an unknown message ID: ${JSON.stringify(
            response,
          )}`,
        ),
      );
      return;
    }

    this._responseHandlers.delete(messageId);
    this._cleanupTimeout(messageId);

    if ('result' in response) {
      handler(response);
    } else {
      const error = new AISDKError({
        name: 'McpClientResponseError',
        message: response.error.message,
        cause: response.error,
      });
      handler(error);
    }
  }

  private async _initTransport(transport: Transport): Promise<void> {
    this._transport = transport;
    this._transport.onclose = () => {
      this._onclose();
    };
    this._transport.onerror = (error: Error) => {
      this._onerror(error);
    };
    this._transport.onmessage = message => {
      if (!('method' in message)) {
        this._onresponse(message);
      } else {
        // This lightweight client implementation does not support
        // notifications or requests from server:
        throw new AISDKError({
          name: 'McpClientError',
          message: 'Unsupported message type',
        });
      }
    };
    await this._transport.start();
  }
}
