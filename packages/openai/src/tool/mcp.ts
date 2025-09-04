import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const mcpAllowedToolsSchema = z.union([
  z.array(z.string()),
  z.object({
    readOnly: z.boolean().optional(),
    toolNames: z.array(z.string()),
  }),
]);

const mcpRequireApprovalSchema = z.union([
  z.enum(['always', 'never']),
  z.object({
    always: z
      .object({
        readOnly: z.boolean().optional(),
        toolNames: z.array(z.string()),
      })
      .optional(),
    never: z
      .object({
        readOnly: z.boolean().optional(),
        toolNames: z.array(z.string()),
      })
      .optional(),
  }),
]);

// Args validation schema
export const mcpArgsSchema = z
  .object({
    serverUrl: z.string().optional(),
    connectorId: z.string().optional(),
    serverLabel: z.string(),
    serverDescription: z.string().optional(),
    requireApproval: mcpRequireApprovalSchema.optional(),
    allowedTools: mcpAllowedToolsSchema.optional(),
    headers: z.record(z.string(), z.string()).optional(),
    authorization: z.string().optional(),
  })
  .refine(val => !(!val.serverUrl && !val.connectorId), {
    error: 'Either serverUrl or connectorId must be provided',
    abort: true,
  })
  .refine(val => !(val.serverUrl && val.connectorId), {
    error: 'Only one of serverUrl or connectorId must be provided',
    abort: true,
  });

export const mcp = createProviderDefinedToolFactory<
  {
    // MCP doesn't take input parameters it should be controlled by the prompt
  },
  {
    server_url?: string;
    connector_id?: string;
    serverLabel: string;
    serverDescription?: string;
    requireApproval?: any;
    headers?: Record<string, string>;
    allowedTools?: any;
  }
>({
  id: 'openai.mcp',
  name: 'mcp',
  inputSchema: z.object({}),
});
