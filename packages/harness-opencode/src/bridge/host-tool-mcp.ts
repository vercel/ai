#!/usr/bin/env node
/*
 * These bridge imports are externalized by tsdown and resolved inside the
 * sandbox from src/bridge/package.json and its lockfile. Keep this file,
 * tsdown.config.ts, and the bridge package dependency list in sync.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { convertHarnessToolModelOutput } from '@ai-sdk/harness/bridge';
import type { ToolResultPart } from '@ai-sdk/provider-utils';
import { jsonSchemaToZodShape } from './json-schema-to-zod';

type ToolSchema = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

const schemas: ToolSchema[] = JSON.parse(process.env.TOOL_SCHEMAS || '[]');
const relayUrl = process.env.TOOL_RELAY_URL || '';

if (!schemas.length || !relayUrl) {
  process.stderr.write(
    '[host-tool-mcp] Missing TOOL_SCHEMAS or TOOL_RELAY_URL; exiting\n',
  );
  process.exit(0);
}

const server = new McpServer({ name: 'harness-tools', version: '1.0.0' });

for (const schema of schemas) {
  const shape = jsonSchemaToZodShape(schema.inputSchema);
  server.tool(
    schema.name,
    schema.description ?? '',
    shape,
    async (input: Record<string, unknown>) => {
      const requestId = crypto.randomUUID();
      try {
        const res = await fetch(relayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requestId, toolName: schema.name, input }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(
            `Tool relay ${schema.name} failed with ${res.status}: ${body.slice(0, 500)}`,
          );
        }
        const data = (await res.json()) as {
          result?: unknown;
          isError?: boolean;
          toolResult?: ToolResultPart;
        };
        if (data.toolResult != null) {
          const converted = convertHarnessToolModelOutput({
            output: data.toolResult.output,
          });
          return {
            content: converted.content.map(part =>
              part.type === 'text'
                ? part
                : {
                    type: 'image' as const,
                    data: part.data,
                    mimeType: part.mediaType,
                  },
            ),
            isError: data.isError === true || converted.isError,
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(data.result ?? null),
            },
          ],
          ...(data.isError === true ? { isError: true } : {}),
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${String(err)}` }],
          isError: true,
        };
      }
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
