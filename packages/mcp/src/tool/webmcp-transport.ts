import { getErrorMessage, isRecord, parseJSON } from '@ai-sdk/provider-utils';
import { MCPClientError } from '../error/mcp-client-error';
import { VERSION } from '../version';
import type { JSONRPCMessage, JSONRPCRequest } from './json-rpc-message';
import type { MCPTransport, MCPTransportSendOptions } from './mcp-transport';
import { LATEST_LEGACY_PROTOCOL_VERSION, type ListToolsResult } from './types';

/** A tool returned by WebMCP's ModelContext.getTools(). */
export interface WebMCPTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  outputSchema?: object;
  origin: string;
  /** Opaque owner handle. Passed back to ModelContext without inspecting it. */
  window: unknown;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
    consequentialHint?: boolean;
    debugging?: boolean;
  };
}

/**
 * The consumer methods of document.modelContext. An application-provided
 * browser bridge can implement the same interface on a backend.
 */
export interface WebMCPModelContext {
  getTools(options?: { fromOrigins?: string[] }): Promise<WebMCPTool[]>;
  executeTool(
    tool: WebMCPTool,
    inputObject?: object,
    options?: { signal?: AbortSignal },
  ): Promise<string>;
}

/**
 * Adapts WebMCP tools to the MCP client without a network MCP server.
 *
 * Pass document.modelContext in a browser, or supply a browser bridge explicitly.
 * Tool lists are snapshots; list tools again after a WebMCP toolchange event.
 * @see https://webmachinelearning.github.io/webmcp/
 */
export class WebMCPTransport implements MCPTransport {
  private readonly modelContext: WebMCPModelContext;
  private readonly fromOrigins?: string[];
  private controller?: AbortController;
  // Keep aliases for the lifetime of the transport so a removed tool's name
  // cannot accidentally be reassigned to a different frame.
  private readonly tools = new Map<string, WebMCPTool>();
  private availableTools = new Set<string>();
  private hasListedTools = false;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor({
    modelContext,
    fromOrigins,
  }: {
    modelContext: WebMCPModelContext;
    /** Additional origins to discover. Browser permissions still apply. */
    fromOrigins?: string[];
  }) {
    this.modelContext = modelContext;
    this.fromOrigins = fromOrigins;
  }

  async start(): Promise<void> {
    if (this.controller != null) {
      throw new MCPClientError({ message: 'WebMCP transport already started' });
    }
    this.controller = new AbortController();
  }

  async send(
    message: JSONRPCMessage,
    options?: MCPTransportSendOptions,
  ): Promise<void> {
    if (this.controller == null) {
      throw new MCPClientError({ message: 'WebMCP transport is not started' });
    }
    // WebMCP has no initialization notification or server-to-client requests.
    if (!('method' in message) || !('id' in message)) {
      return;
    }

    const signal =
      options?.signal == null
        ? this.controller.signal
        : AbortSignal.any([this.controller.signal, options.signal]);
    signal.throwIfAborted();

    let response: JSONRPCMessage;
    try {
      const result = await this.handleRequest(message, signal);
      signal.throwIfAborted();
      response = { jsonrpc: '2.0', id: message.id, result };
    } catch (error) {
      signal.throwIfAborted();
      response = {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: MCPClientError.isInstance(error)
            ? (error.code ?? -32603)
            : -32603,
          message:
            isRecord(error) && typeof error.message === 'string'
              ? error.message || String(error.name ?? 'WebMCP error')
              : getErrorMessage(error),
          ...(!MCPClientError.isInstance(error) &&
          isRecord(error) &&
          typeof error.name === 'string'
            ? { data: { name: error.name } }
            : {}),
        },
      };
    }
    this.onmessage?.(response);
  }

  async close(): Promise<void> {
    if (this.controller == null) {
      return;
    }
    this.controller.abort();
    this.controller = undefined;
    this.tools.clear();
    this.availableTools.clear();
    this.hasListedTools = false;
    this.onclose?.();
  }

  private async handleRequest(request: JSONRPCRequest, signal: AbortSignal) {
    switch (request.method) {
      case 'initialize':
        return {
          protocolVersion: LATEST_LEGACY_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'webmcp', version: VERSION },
        };
      case 'ping':
        return {};
      case 'tools/list':
        return this.listTools(signal);
      case 'tools/call': {
        const name = request.params?.name;
        const args =
          request.params?.arguments === undefined
            ? {}
            : request.params.arguments;
        if (
          typeof name !== 'string' ||
          typeof args !== 'object' ||
          args === null ||
          Array.isArray(args)
        ) {
          throw new MCPClientError({
            message: 'Invalid WebMCP tool call',
            code: -32602,
          });
        }
        if (!this.hasListedTools) {
          await this.listTools(signal);
        }
        const tool = this.tools.get(name);
        if (tool == null || !this.availableTools.has(name)) {
          throw new MCPClientError({
            message: `Unknown WebMCP tool: ${name}`,
            code: -32602,
          });
        }

        let text: string;
        try {
          text = await this.modelContext.executeTool(tool, args, { signal });
        } catch (error) {
          signal.throwIfAborted();
          // The spec uses OperationError for rejected callbacks and results
          // that cannot be serialized. Other DOMExceptions are platform errors.
          if (isRecord(error) && error.name === 'OperationError') {
            return {
              content: [
                {
                  type: 'text',
                  text:
                    typeof error.message === 'string' && error.message
                      ? error.message
                      : error.name,
                },
              ],
              isError: true,
            };
          }
          throw error;
        }

        const value = await parseJSON({ text });
        return {
          content: [
            { type: 'text', text: typeof value === 'string' ? value : text },
          ],
          structuredContent: value,
        };
      }
      default:
        throw new MCPClientError({
          message: `Unsupported WebMCP method: ${request.method}`,
          code: -32601,
        });
    }
  }

  private async listTools(signal: AbortSignal): Promise<ListToolsResult> {
    const registered = await this.modelContext.getTools(
      this.fromOrigins == null ? undefined : { fromOrigins: this.fromOrigins },
    );
    signal.throwIfAborted();
    const availableTools = new Set<string>();
    const tools = registered.map(tool => {
      let name = [...this.tools].find(
        ([, previous]) =>
          previous.name === tool.name &&
          previous.origin === tool.origin &&
          previous.window === tool.window,
      )?.[0];
      if (name == null) {
        name = tool.name;
        let suffix = 2;
        while (this.tools.has(name)) {
          const ending = `_${suffix++}`;
          name = `${tool.name.slice(0, 128 - ending.length)}${ending}`;
        }
      }
      this.tools.set(name, tool);
      availableTools.add(name);
      return {
        name,
        title: tool.title,
        description: tool.description,
        inputSchema:
          tool.inputSchema == null
            ? { type: 'object', properties: {} }
            : { ...tool.inputSchema },
        outputSchema:
          tool.outputSchema == null ? undefined : { ...tool.outputSchema },
        annotations:
          tool.annotations == null
            ? undefined
            : { readOnlyHint: tool.annotations.readOnlyHint },
        _meta: {
          'ai-sdk.dev/webmcp': {
            name: tool.name,
            origin: tool.origin,
            annotations: tool.annotations ?? {},
          },
        },
      };
    });
    this.availableTools = availableTools;
    this.hasListedTools = true;
    return { tools };
  }
}
