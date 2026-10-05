import type { JSONSchema7 } from '@ai-sdk/provider';
import {
  dynamicTool,
  jsonSchema,
  type Context,
  type ToolExecutionOptions,
} from '@ai-sdk/provider-utils';
import { MCPClientError } from '../error/mcp-client-error';
import {
  ListEventsResultSchema,
  type ListEventsResult,
  type MCPEvent,
} from './mcp-events';

/**
 * Convert selected webhook event definitions into model-callable subscription tools.
 * The application owns authorization, callback registration, persistence and renewal.
 * This helper never sends events/subscribe or exposes delivery credentials itself.
 */
export function eventToolsFromDefinitions(
  definitions: Pick<ListEventsResult, 'events'>,
  {
    subscribe,
    toolName = event =>
      `mcp_subscribe_${event.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    needsApproval,
  }: {
    subscribe: (
      input: { name: string; arguments: Record<string, unknown> },
      options: ToolExecutionOptions<Context>,
    ) => unknown | PromiseLike<unknown>;
    /** Use an application-owned namespace when combining tools from multiple sources. */
    toolName?: (event: MCPEvent) => string;
    needsApproval?: boolean;
  },
): Record<string, ReturnType<typeof dynamicTool>> {
  const { events } = ListEventsResultSchema.parse(definitions);
  const tools: Record<string, ReturnType<typeof dynamicTool>> = Object.create(
    null,
  );

  for (const event of events) {
    // A webhook backend cannot service poll-only or push-only event definitions.
    if (!event.delivery.includes('webhook')) continue;

    const name = toolName(event);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
      throw new MCPClientError({
        message: `Invalid generated event tool name: ${name}. Supply a toolName mapping using 1–64 letters, digits, underscores or hyphens.`,
      });
    }
    if (Object.hasOwn(tools, name)) {
      throw new MCPClientError({
        message: `Duplicate event tool name: ${name}. Supply a unique toolName mapping.`,
      });
    }

    // Keep the server schema at the root: wrapping it would change local $ref resolution.
    tools[name] = dynamicTool({
      description: `Subscribe to the "${event.name}" event.${event.description ? ` ${event.description}` : ''}`,
      inputSchema: jsonSchema(event.inputSchema as JSONSchema7),
      ...(needsApproval == null ? {} : { needsApproval }),
      execute: async (input, options) => {
        options.abortSignal?.throwIfAborted();
        if (
          input == null ||
          typeof input !== 'object' ||
          Array.isArray(input)
        ) {
          throw new MCPClientError({
            message: 'Event subscription arguments must be an object',
          });
        }
        return subscribe(
          { name: event.name, arguments: input as Record<string, unknown> },
          options,
        );
      },
    });
  }

  return tools;
}
