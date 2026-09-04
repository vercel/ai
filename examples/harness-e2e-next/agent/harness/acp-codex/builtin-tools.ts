import { commonTool } from '@ai-sdk/harness';
import type { ToolSet } from '@ai-sdk/provider-utils';
import { z } from 'zod';

const webSearchActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('search'),
    query: z.string().optional(),
    queries: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('open_page'),
    url: z.string().optional(),
  }),
  z.object({
    type: z.literal('find_in_page'),
    url: z.string().optional(),
    pattern: z.string().optional(),
  }),
  z.object({ type: z.literal('other') }),
]);

/*
 * Inputs match the commandExecution and webSearch ThreadItem values emitted
 * by @agentclientprotocol/codex-acp 1.1.4.
 */
export const codexACPBuiltinTools = {
  bash: commonTool('bash', {
    nativeName: 'shell',
    toolUseKind: 'bash',
    inputSchema: z.object({
      command: z.string(),
      cwd: z.string().optional(),
    }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'web_search',
    toolUseKind: 'readonly',
    inputSchema: z.object({
      type: z.literal('webSearch').optional(),
      id: z.string().optional(),
      query: z.string(),
      action: webSearchActionSchema.nullable().optional(),
    }),
  }),
} as const satisfies ToolSet;
