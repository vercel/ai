import type { JSONObject, JSONSchema7, JSONValue } from '@ai-sdk/provider';
import {
  dynamicTool,
  jsonSchema,
  type DynamicTool,
  type ToolResultOutput,
} from '@ai-sdk/provider-utils';
import { MCPClientError } from '../error/mcp-client-error';
import { getMCPAppToolMeta, MCP_APP_MIME_TYPE } from './mcp-apps';
import {
  ListToolsResultSchema,
  type MCPTool,
  type McpProviderMetadata,
  type ToolMeta,
} from './types';

/**
 * Validates MCP tool definitions and creates AI SDK tools without execute
 * functions. Use when tool calls are executed elsewhere, such as in a browser.
 *
 * @param definitions The tools array returned by MCPClient.listTools().
 * @throws MCPClientError if definitions are invalid or tool names are duplicated.
 */
export function createMCPTools(
  definitions: unknown,
): Record<string, DynamicTool & { _meta?: ToolMeta }> {
  const parsed = ListToolsResultSchema.safeParse({ tools: definitions });
  if (!parsed.success) {
    throw new MCPClientError({
      message: 'Invalid MCP tool definitions',
      cause: parsed.error,
    });
  }

  const tools: Record<string, DynamicTool & { _meta?: ToolMeta }> =
    Object.create(null);
  for (const definition of parsed.data.tools) {
    if (Object.prototype.hasOwnProperty.call(tools, definition.name)) {
      throw new MCPClientError({
        message: `Duplicate MCP tool name "${definition.name}"`,
      });
    }
    try {
      tools[definition.name] = dynamicTool(createMCPToolDefinition(definition));
    } catch (cause) {
      throw new MCPClientError({
        message: `Invalid MCP tool definition "${definition.name}"`,
        cause,
      });
    }
  }
  return tools;
}

/** Shared conversion for connected clients and tools executed elsewhere. */
export function createMCPToolDefinition(
  { name, title, description, inputSchema, annotations, _meta }: MCPTool,
  clientName?: string,
) {
  const resolvedTitle = title ?? annotations?.title;
  const appMeta = getMCPAppToolMeta({ _meta });
  const metadata = {
    ...(clientName != null ? { clientName } : {}),
    toolName: name,
    ...(resolvedTitle != null ? { title: resolvedTitle } : {}),
    ...(annotations != null
      ? {
          annotations: {
            ...(annotations.title != null ? { title: annotations.title } : {}),
            ...(annotations.readOnlyHint != null
              ? { readOnlyHint: annotations.readOnlyHint }
              : {}),
            ...(annotations.destructiveHint != null
              ? { destructiveHint: annotations.destructiveHint }
              : {}),
            ...(annotations.idempotentHint != null
              ? { idempotentHint: annotations.idempotentHint }
              : {}),
            ...(annotations.openWorldHint != null
              ? { openWorldHint: annotations.openWorldHint }
              : {}),
          },
        }
      : {}),
    ...(appMeta?.resourceUri != null
      ? {
          app: {
            ...appMeta,
            mimeType: MCP_APP_MIME_TYPE,
          } as JSONObject,
        }
      : {}),
  } satisfies McpProviderMetadata;

  return {
    description,
    title: resolvedTitle,
    metadata,
    inputSchema: jsonSchema({
      ...inputSchema,
      properties: inputSchema.properties ?? {},
      additionalProperties: false,
    } as JSONSchema7),
    toModelOutput: mcpToModelOutput,
    _meta,
  };
}

function mcpToModelOutput({
  output,
}: {
  toolCallId: string;
  input: unknown;
  output: unknown;
}): ToolResultOutput {
  if (
    output != null &&
    typeof output === 'object' &&
    'isError' in output &&
    output.isError === true
  ) {
    if ('content' in output && Array.isArray(output.content)) {
      const textParts: string[] = [];
      let allText = output.content.length > 0;
      for (const part of output.content) {
        if (
          part != null &&
          typeof part === 'object' &&
          part.type === 'text' &&
          typeof part.text === 'string'
        ) {
          textParts.push(part.text);
        } else {
          allText = false;
          break;
        }
      }
      if (allText) {
        return { type: 'error-text', value: textParts.join('\n') };
      }
    }
    return { type: 'error-json', value: output as JSONValue };
  }

  if (typeof output === 'string') {
    return { type: 'text', value: output };
  }

  if (
    output == null ||
    typeof output !== 'object' ||
    !('content' in output) ||
    !Array.isArray(output.content)
  ) {
    return { type: 'json', value: (output ?? null) as JSONValue };
  }

  const convertedContent = output.content.map(
    (part: { type: string; [key: string]: unknown }) => {
      if (part.type === 'text' && 'text' in part) {
        return { type: 'text' as const, text: part.text as string };
      }
      if (part.type === 'image' && 'data' in part && 'mimeType' in part) {
        return {
          type: 'file' as const,
          mediaType: part.mimeType as string,
          data: { type: 'data' as const, data: part.data as string },
        };
      }
      return { type: 'text' as const, text: JSON.stringify(part) };
    },
  );

  return { type: 'content', value: convertedContent };
}
