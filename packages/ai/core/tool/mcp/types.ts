import { z } from 'zod';

export const LATEST_PROTOCOL_VERSION = '2024-11-05';
export const SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  '2024-10-07',
];
const JSONRPC_VERSION = '2.0';

const ImplementationSchema = z
  .object({
    name: z.string(),
    version: z.string(),
  })
  .passthrough();
export type Implementation = z.infer<typeof ImplementationSchema>;

const BaseRequestParamsSchema = z
  .object({
    _meta: z.optional(z.object({}).passthrough()),
  })
  .passthrough();

const RequestSchema = z.object({
  method: z.string(),
  params: z.optional(BaseRequestParamsSchema),
});
export type Request = z.infer<typeof RequestSchema>;
export type RequestOptions = {
  signal?: AbortSignal;
  timeout?: number;
  maxTotalTimeout?: number;
};
const BaseNotificationParamsSchema = z
  .object({
    _meta: z.optional(z.object({}).passthrough()),
  })
  .passthrough();
const NotificationSchema = z.object({
  method: z.string(),
  params: z.optional(BaseNotificationParamsSchema),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const ResultSchema = z
  .object({
    /**
     * This result property is reserved by the protocol to allow clients and servers to attach additional metadata to their responses.
     */
    _meta: z.optional(z.object({}).passthrough()),
  })
  .passthrough();

export interface TimeoutInfo {
  timeoutId: ReturnType<typeof setTimeout>;
  startTime: number;
  timeout: number;
  maxTotalTimeout?: number;
  onTimeout: () => void;
}

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
const JSONRPCMessageSchema = z.union([
  JSONRPCRequestSchema,
  JSONRPCNotificationSchema,
  JSONRPCResponseSchema,
  JSONRPCErrorSchema,
]);
export type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;

export interface Transport {
  start(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  close(): Promise<void>;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
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
  /**
   * The version of the Model Context Protocol that the server wants to use. This may not match the version that the client requested. If the client cannot support this version, it MUST disconnect.
   */
  protocolVersion: z.string(),
  capabilities: ServerCapabilitiesSchema,
  serverInfo: ImplementationSchema,
  /**
   * Instructions describing how to use the server and its features.
   *
   * This can be used by clients to improve the LLM's understanding of available tools, resources, etc. It can be thought of like a "hint" to the model. For example, this information MAY be added to the system prompt.
   */
  instructions: z.optional(z.string()),
});

const CursorSchema = z.string();
const PaginatedResultSchema = ResultSchema.extend({
  nextCursor: z.optional(CursorSchema),
});
export const PaginatedRequestSchema = RequestSchema.extend({
  params: BaseRequestParamsSchema.extend({
    cursor: z.optional(CursorSchema),
  }).optional(),
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
export const ListToolsResultSchema = PaginatedResultSchema.extend({
  tools: z.array(ToolSchema),
});
export type ListToolsResult = z.infer<typeof ListToolsResultSchema>;
const ListToolsRequestSchema = PaginatedRequestSchema.extend({
  method: z.literal('tools/list'),
});
export type ListToolsRequest = z.infer<typeof ListToolsRequestSchema>;

const CallToolRequestSchema = RequestSchema.extend({
  method: z.literal('tools/call'),
  params: BaseRequestParamsSchema.extend({
    name: z.string(),
    arguments: z.optional(z.record(z.unknown())),
  }),
});
export type CallToolRequest = z.infer<typeof CallToolRequestSchema>;
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
});
export const CompatibilityCallToolResultSchema = CallToolResultSchema.or(
  ResultSchema.extend({
    toolResult: z.unknown(),
  }),
);
export type CallToolResult = z.infer<typeof CallToolResultSchema>;
export type CompatibilityCallToolResult = z.infer<
  typeof CompatibilityCallToolResultSchema
>;
