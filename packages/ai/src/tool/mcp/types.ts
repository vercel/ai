import { z } from 'zod/v4';
import { JSONObject } from '@ai-sdk/provider';
import { FlexibleSchema, Tool } from '@ai-sdk/provider-utils';

export const LATEST_PROTOCOL_VERSION = '2025-06-18';
export const SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  '2025-03-26',
  '2024-11-05',
];

export type ToolSchemas =
  | Record<string, { inputSchema: FlexibleSchema<JSONObject | unknown> }>
  | 'automatic'
  | undefined;

export type McpToolSet<TOOL_SCHEMAS extends ToolSchemas = 'automatic'> =
  TOOL_SCHEMAS extends Record<string, { inputSchema: FlexibleSchema<any> }>
    ? {
        [K in keyof TOOL_SCHEMAS]: TOOL_SCHEMAS[K] extends {
          inputSchema: FlexibleSchema<infer INPUT>;
        }
          ? Tool<INPUT, CallToolResult> &
              Required<Pick<Tool<INPUT, CallToolResult>, 'execute'>>
          : never;
      }
    : McpToolSet<Record<string, { inputSchema: FlexibleSchema<unknown> }>>;

const ClientOrServerImplementationSchema = z.looseObject({
  name: z.string(),
  version: z.string(),
});

export type Configuration = z.infer<typeof ClientOrServerImplementationSchema>;

export const BaseParamsSchema = z.looseObject({
  _meta: z.optional(z.object({}).loose()),
});
type BaseParams = z.infer<typeof BaseParamsSchema>;
export const ResultSchema = BaseParamsSchema;

export const RequestSchema = z.object({
  method: z.string(),
  params: z.optional(BaseParamsSchema),
});
export type Request = z.infer<typeof RequestSchema>;
export type RequestOptions = {
  signal?: AbortSignal;
  timeout?: number;
  maxTotalTimeout?: number;
};

export type Notification = z.infer<typeof RequestSchema>;

const ServerCapabilitiesSchema = z.looseObject({
  experimental: z.optional(z.object({}).loose()),
  logging: z.optional(z.object({}).loose()),
  prompts: z.optional(
    z.looseObject({
      listChanged: z.optional(z.boolean()),
    }),
  ),
  resources: z.optional(
    z.looseObject({
      subscribe: z.optional(z.boolean()),
      listChanged: z.optional(z.boolean()),
    }),
  ),
  tools: z.optional(
    z.looseObject({
      listChanged: z.optional(z.boolean()),
    }),
  ),
});

export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;

export const InitializeResultSchema = ResultSchema.extend({
  protocolVersion: z.string(),
  capabilities: ServerCapabilitiesSchema,
  serverInfo: ClientOrServerImplementationSchema,
  instructions: z.optional(z.string()),
});
export type InitializeResult = z.infer<typeof InitializeResultSchema>;

export type PaginatedRequest = Request & {
  params?: BaseParams & {
    cursor?: string;
  };
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
        properties: z.optional(z.object({}).loose()),
      })
      .loose(),
  })
  .loose();
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
  .loose();
const ImageContentSchema = z
  .object({
    type: z.literal('image'),
    data: z.base64(),
    mimeType: z.string(),
  })
  .loose();
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
  .loose();
const TextResourceContentsSchema = ResourceContentsSchema.extend({
  text: z.string(),
});
const BlobResourceContentsSchema = ResourceContentsSchema.extend({
  blob: z.base64(),
});
const EmbeddedResourceSchema = z
  .object({
    type: z.literal('resource'),
    resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
  })
  .loose();

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
