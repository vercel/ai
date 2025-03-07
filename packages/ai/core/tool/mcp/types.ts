import { z } from 'zod';
import { IOType } from 'node:child_process';
import { Stream } from 'node:stream';
import { Tool, ToolExecutionOptions } from '../tool';
import { inferParameters } from '../tool';
import { ToolParameters } from '../tool';

export const LATEST_PROTOCOL_VERSION = '2024-11-05';
export const SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  '2024-10-07',
];
const JSONRPC_VERSION = '2.0';

export type ToolSchemas =
  | Record<string, { parameters: ToolParameters }>
  | 'automatic'
  | undefined;

export type McpToolSet<TOOL_SCHEMAS extends ToolSchemas = 'automatic'> =
  TOOL_SCHEMAS extends Record<string, { parameters: ToolParameters }>
    ? {
        [K in keyof TOOL_SCHEMAS]: Tool<
          TOOL_SCHEMAS[K]['parameters'],
          CallToolResult
        > & {
          execute: (
            args: inferParameters<TOOL_SCHEMAS[K]['parameters']>,
            options: ToolExecutionOptions,
          ) => PromiseLike<CallToolResult>;
        };
      }
    : {
        [k: string]: Tool<z.ZodUnknown, CallToolResult> & {
          execute: (
            args: unknown,
            options: ToolExecutionOptions,
          ) => PromiseLike<CallToolResult>;
        };
      };

export interface McpStdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  stderr?: IOType | Stream | number;
  cwd?: string;
  type: 'stdio';
}
export interface McpSSEServerConfig {
  type: 'sse';
  url: string;
}
export type TransportConfig = McpStdioServerConfig | McpSSEServerConfig;

const ClientOrServerImplementationSchema = z
  .object({
    name: z.string(),
    version: z.string(),
  })
  .passthrough();
export type Configuration = z.infer<typeof ClientOrServerImplementationSchema>;

const BaseParamsSchema = z
  .object({
    _meta: z.optional(z.object({}).passthrough()),
  })
  .passthrough();
type BaseParams = z.infer<typeof BaseParamsSchema>;

export interface Request {
  method: string;
  params?: BaseParams;
}

export type RequestOptions = {
  signal?: AbortSignal;
  timeout?: number;
  maxTotalTimeout?: number;
};

const RequestSchema = z.object({
  method: z.string(),
  params: z.optional(BaseParamsSchema),
});
const ResultSchema = BaseParamsSchema;
const NotificationSchema = z.object({
  method: z.string(),
  params: z.optional(BaseParamsSchema),
});

export type Notification = z.infer<typeof NotificationSchema>;

const RequestIdSchema = z.union([z.string(), z.number().int()]);
const JSONRPCRequestSchema = z
  .object({
    jsonrpc: z.literal(JSONRPC_VERSION),
    id: RequestIdSchema,
  })
  .merge(RequestSchema)
  .strict();
export type JSONRPCRequest = z.infer<typeof JSONRPCRequestSchema>;
const JSONRPCResponseSchema = z
  .object({
    jsonrpc: z.literal(JSONRPC_VERSION),
    id: RequestIdSchema,
    result: ResultSchema,
  })
  .strict();
export type JSONRPCResponse = z.infer<typeof JSONRPCResponseSchema>;
const JSONRPCErrorSchema = z
  .object({
    jsonrpc: z.literal(JSONRPC_VERSION),
    id: RequestIdSchema,
    error: z.object({
      code: z.number().int(),
      message: z.string(),
      data: z.optional(z.unknown()),
    }),
  })
  .strict();
export type JSONRPCError = z.infer<typeof JSONRPCErrorSchema>;
const JSONRPCNotificationSchema = z
  .object({
    jsonrpc: z.literal(JSONRPC_VERSION),
  })
  .merge(NotificationSchema)
  .strict();
export type JSONRPCNotification = z.infer<typeof JSONRPCNotificationSchema>;

export const JSONRPCMessageSchema = z.union([
  JSONRPCRequestSchema,
  JSONRPCNotificationSchema,
  JSONRPCResponseSchema,
  JSONRPCErrorSchema,
]);
export type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;

export interface MCPTransport {
  start(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  close(): Promise<void>;
  onClose?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (message: JSONRPCMessage) => void;
}

const ServerCapabilitiesSchema = z
  .object({
    experimental: z.optional(z.object({}).passthrough()),
    logging: z.optional(z.object({}).passthrough()),
    prompts: z.optional(
      z
        .object({
          listChanged: z.optional(z.boolean()),
        })
        .passthrough(),
    ),
    resources: z.optional(
      z
        .object({
          subscribe: z.optional(z.boolean()),
          listChanged: z.optional(z.boolean()),
        })
        .passthrough(),
    ),
    tools: z.optional(
      z
        .object({
          listChanged: z.optional(z.boolean()),
        })
        .passthrough(),
    ),
  })
  .passthrough();
export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;
export const InitializeResultSchema = ResultSchema.extend({
  protocolVersion: z.string(),
  capabilities: ServerCapabilitiesSchema,
  serverInfo: ClientOrServerImplementationSchema,
  instructions: z.optional(z.string()),
});
export type InitializeResult = z.infer<typeof InitializeResultSchema>;

type PaginatedRequest = Request & {
  params?: BaseParams & {
    cursor?: string;
  };
};

export type CallToolRequest = Request & {
  params?: BaseParams & {
    name: string;
    arguments?: Record<string, unknown>;
  };
};

export type ListToolsRequest = PaginatedRequest & {
  method: 'tools/list';
};

const PaginatedResultSchema = ResultSchema.extend({
  nextCursor: z.optional(z.string()),
});

const ToolSchema = z
  .object({
    name: z.string(),
    description: z.optional(z.string()),
    inputSchema: z
      .object({
        type: z.literal('object'),
        properties: z.optional(z.object({}).passthrough()),
      })
      .passthrough(),
  })
  .passthrough();
export type MCPTool = z.infer<typeof ToolSchema>;
export const ListToolsResultSchema = PaginatedResultSchema.extend({
  tools: z.array(ToolSchema),
});
export type ListToolsResult = z.infer<typeof ListToolsResultSchema>;

const TextContentSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
  })
  .passthrough();
const ImageContentSchema = z
  .object({
    type: z.literal('image'),
    data: z.string().base64(),
    mimeType: z.string(),
  })
  .passthrough();
const ResourceContentsSchema = z
  .object({
    /**
     * The URI of this resource.
     */
    uri: z.string(),
    /**
     * The MIME type of this resource, if known.
     */
    mimeType: z.optional(z.string()),
  })
  .passthrough();
const TextResourceContentsSchema = ResourceContentsSchema.extend({
  text: z.string(),
});
const BlobResourceContentsSchema = ResourceContentsSchema.extend({
  blob: z.string().base64(),
});
const EmbeddedResourceSchema = z
  .object({
    type: z.literal('resource'),
    resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
  })
  .passthrough();

export const CallToolResultSchema = ResultSchema.extend({
  content: z.array(
    z.union([TextContentSchema, ImageContentSchema, EmbeddedResourceSchema]),
  ),
  isError: z.boolean().default(false).optional(),
}).or(
  ResultSchema.extend({
    toolResult: z.unknown(),
  }),
);
export type CallToolResult = z.infer<typeof CallToolResultSchema>;
