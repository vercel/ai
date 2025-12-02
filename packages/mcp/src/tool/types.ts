import { z } from 'zod/v4';
import { JSONObject } from '@ai-sdk/provider';
import { FlexibleSchema, Tool } from '@ai-sdk/provider-utils';

export const LATEST_PROTOCOL_VERSION = '2025-06-18';
export const SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  '2025-03-26',
  '2024-11-05',
];

/** MCP tool metadata - keys should follow MCP _meta key format specification */
const ToolMetaSchema = z.optional(z.record(z.string(), z.unknown()));
export type ToolMeta = z.infer<typeof ToolMetaSchema>;

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
              Required<Pick<Tool<INPUT, CallToolResult>, 'execute'>> & {
                _meta?: ToolMeta;
              }
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

/** @see https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation */
const ElicitationCapabilitySchema = z
  .object({
    applyDefaults: z.optional(z.boolean()),
  })
  .loose();

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
  elicitation: z.optional(ElicitationCapabilitySchema),
});

export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;
export const ClientCapabilitiesSchema = z
  .object({
    elicitation: z.optional(ElicitationCapabilitySchema),
  })
  .loose();

export type ClientCapabilities = z.infer<typeof ClientCapabilitiesSchema>;
export type ElicitationCapability = z.infer<typeof ElicitationCapabilitySchema>;

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
    annotations: z.optional(
      z
        .object({
          title: z.optional(z.string()),
        })
        .loose(),
    ),
    _meta: ToolMetaSchema,
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
export const ResourceSchema = z
  .object({
    uri: z.string(),
    name: z.string(),
    title: z.optional(z.string()),
    description: z.optional(z.string()),
    mimeType: z.optional(z.string()),
    size: z.optional(z.number()),
  })
  .loose();
export type MCPResource = z.infer<typeof ResourceSchema>;

export const ListResourcesResultSchema = PaginatedResultSchema.extend({
  resources: z.array(ResourceSchema),
});
export type ListResourcesResult = z.infer<typeof ListResourcesResultSchema>;

const ResourceContentsSchema = z
  .object({
    /**
     * The URI of this resource.
     */
    uri: z.string(),
    /**
     * Optional display name of the resource content.
     */
    name: z.optional(z.string()),
    /**
     * Optional human readable title.
     */
    title: z.optional(z.string()),
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

const ResourceTemplateSchema = z
  .object({
    uriTemplate: z.string(),
    name: z.string(),
    title: z.optional(z.string()),
    description: z.optional(z.string()),
    mimeType: z.optional(z.string()),
  })
  .loose();

export const ListResourceTemplatesResultSchema = ResultSchema.extend({
  resourceTemplates: z.array(ResourceTemplateSchema),
});
export type ListResourceTemplatesResult = z.infer<
  typeof ListResourceTemplatesResultSchema
>;

export const ReadResourceResultSchema = ResultSchema.extend({
  contents: z.array(
    z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
  ),
});
export type ReadResourceResult = z.infer<typeof ReadResourceResultSchema>;

// Prompts
const PromptArgumentSchema = z
  .object({
    name: z.string(),
    description: z.optional(z.string()),
    required: z.optional(z.boolean()),
  })
  .loose();

export const PromptSchema = z
  .object({
    name: z.string(),
    title: z.optional(z.string()),
    description: z.optional(z.string()),
    arguments: z.optional(z.array(PromptArgumentSchema)),
  })
  .loose();
export type MCPPrompt = z.infer<typeof PromptSchema>;

export const ListPromptsResultSchema = PaginatedResultSchema.extend({
  prompts: z.array(PromptSchema),
});
export type ListPromptsResult = z.infer<typeof ListPromptsResultSchema>;

const PromptMessageSchema = z
  .object({
    role: z.union([z.literal('user'), z.literal('assistant')]),
    content: z.union([
      TextContentSchema,
      ImageContentSchema,
      EmbeddedResourceSchema,
    ]),
  })
  .loose();
export type MCPPromptMessage = z.infer<typeof PromptMessageSchema>;

export const GetPromptResultSchema = ResultSchema.extend({
  description: z.optional(z.string()),
  messages: z.array(PromptMessageSchema),
});
export type GetPromptResult = z.infer<typeof GetPromptResultSchema>;

const ElicitationRequestParamsSchema = BaseParamsSchema.extend({
  message: z.string(),
  requestedSchema: z.unknown(),
});

export const ElicitationRequestSchema = RequestSchema.extend({
  method: z.literal('elicitation/create'),
  params: ElicitationRequestParamsSchema,
});

export type ElicitationRequest = z.infer<typeof ElicitationRequestSchema>;

export const ElicitResultSchema = ResultSchema.extend({
  action: z.union([
    z.literal('accept'),
    z.literal('decline'),
    z.literal('cancel'),
  ]),
  content: z.optional(z.record(z.string(), z.unknown())),
});

export type ElicitResult = z.infer<typeof ElicitResultSchema>;
