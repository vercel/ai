import { createProviderDefinedToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Args validation schema
export const mcpArgsSchema = z.object({
  serverUrl: z.string().optional(),
  connectorId: z.string().optional(),
  serverLabel: z.string(),
  serverDescription: z.string().optional(),
  requireApproval: z.any().optional(),
  allowedTools: z.array(z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const mcp = createProviderDefinedToolFactory<
  {
    // MCP doesn't take input parameters it should be controlled by the prompt
  },
  {
    server_url?: string;
    connector_id?: string;
    server_label: string;
    server_description?: string;
    require_approval?: any;
    headers?: Record<string, string>;
    allowed_tools?: string[];
  }
>({
  id: 'openai.mcp',
  name: 'mcp',
  inputSchema: z.object({}),
});
