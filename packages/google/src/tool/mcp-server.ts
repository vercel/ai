import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { redactGoogleToolArgs } from '../redact-google-tool-credentials';

/**
 * A remote MCP server that Gemini connects to on the model's behalf.
 *
 * `headers` carry connector credentials, so the provider keeps them out of
 * telemetry while still sending them to the Interactions API.
 *
 * @see https://ai.google.dev/gemini-api/docs/interactions
 */
export const mcpServer = createProviderExecutedToolFactory<
  {},
  {},
  {
    /** Name of the MCP server. */
    name?: string;
    /** URL of the MCP server. */
    url?: string;
    /** HTTP headers sent to the MCP server, e.g. an `Authorization` header. */
    headers?: Record<string, string>;
    /** Names of the MCP tools the model may call. */
    allowedTools?: string[];
  }
>({
  id: 'google.mcp_server',
  redactArgs: args => redactGoogleToolArgs('google.mcp_server', args),
  inputSchema: lazySchema(() => zodSchema(z.object({}))),
  outputSchema: lazySchema(() => zodSchema(z.object({}))),
});
